/**
 * Remote S3-compatible storage backend
 *
 * Supports S3, Cloudflare R2, MinIO, etc.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { NewsItem, RssItem } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { formatDateFolder, getCurrentTimeDisplay } from "../utils/time.js";
import type { RssData, StorageBackend, StorageNewsData } from "./base.js";

/**
 * Remote S3-compatible storage backend
 */
export class RemoteStorageBackend implements StorageBackend {
  private client: S3Client;
  private bucketName: string;
  private enableHtml: boolean;
  private timezone: string;

  readonly backendName = "remote";
  readonly supportsTxt = false; // Remote doesn't support TXT snapshots

  constructor(options: {
    bucketName: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpointUrl: string;
    region?: string;
    enableTxt?: boolean;
    enableHtml?: boolean;
    timezone?: string;
  }) {
    this.bucketName = options.bucketName;
    this.enableHtml = options.enableHtml ?? true;
    this.timezone = options.timezone || "Asia/Shanghai";

    this.client = new S3Client({
      endpoint: options.endpointUrl,
      region: options.region || "auto",
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      forcePathStyle: true, // Required for S3-compatible services
    });
  }

  /**
   * Get today's date string
   */
  private getToday(): string {
    return formatDateFolder(this.timezone);
  }

  /**
   * Get current time display (HH:MM)
   */
  private getCurrentTimeDisplay(): string {
    return getCurrentTimeDisplay(this.timezone);
  }

  /**
   * Get S3 key for news data
   */
  private getNewsKey(date: string, time: string): string {
    return `news/${date}/${time}.json`;
  }

  /**
   * Get S3 key for RSS data
   */
  private getRssKey(date: string, time: string): string {
    return `rss/${date}/${time}.json`;
  }

  /**
   * Upload JSON to S3
   */
  private async uploadJson(key: string, data: unknown): Promise<boolean> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: JSON.stringify(data, null, 2),
          ContentType: "application/json",
        }),
      );
      return true;
    } catch (error) {
      logger.error({ err: error, key }, "Failed to upload to S3");
      return false;
    }
  }

  /**
   * Download JSON from S3
   */
  private async downloadJson<T>(key: string): Promise<T | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      const body = await response.Body?.transformToString();
      if (!body) return null;

      return JSON.parse(body) as T;
    } catch {
      return null;
    }
  }

  /**
   * List objects with prefix
   */
  private async listObjects(prefix: string): Promise<string[]> {
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
        }),
      );

      return (
        response.Contents?.map((obj) => obj.Key || "").filter(Boolean) || []
      );
    } catch (error) {
      logger.error({ err: error, prefix }, "Failed to list S3 objects");
      return [];
    }
  }

  /**
   * Save news data to S3
   */
  async saveNewsData(data: StorageNewsData): Promise<boolean> {
    const crawlTime = data.crawlTime || this.getCurrentTimeDisplay();
    const key = this.getNewsKey(data.date, crawlTime.replace(":", "-"));

    // Convert NewsItem to plain object for JSON serialization
    const serializable = {
      ...data,
      crawlTime,
      items: Object.fromEntries(
        Object.entries(data.items).map(([sourceId, items]) => [
          sourceId,
          items.map((item) => ({
            title: item.title,
            platformId: item.platformId,
            rank: item.rank,
            ranks: item.ranks,
            url: item.url,
            mobileUrl: item.mobileUrl,
            firstCrawlTime: item.firstCrawlTime,
            lastCrawlTime: item.lastCrawlTime,
            crawlCount: item.crawlCount,
          })),
        ]),
      ),
    };

    return this.uploadJson(key, serializable);
  }

  /**
   * Save RSS data to S3
   */
  async saveRssData(data: RssData): Promise<boolean> {
    const crawlTime = data.crawlTime || this.getCurrentTimeDisplay();
    const key = this.getRssKey(data.date, crawlTime.replace(":", "-"));

    return this.uploadJson(key, data);
  }

  /**
   * Get RSS data for a date
   */
  async getRssData(date?: string): Promise<RssData | null> {
    const targetDate = date || this.getToday();
    const prefix = `rss/${targetDate}/`;

    const keys = await this.listObjects(prefix);
    if (keys.length === 0) return null;

    // Get all crawl data and merge
    const allItems: Record<string, RssItem[]> = {};
    const idToName: Record<string, string> = {};
    let latestCrawlTime = "";

    for (const key of keys.sort()) {
      const data = await this.downloadJson<RssData>(key);
      if (!data) continue;

      if (data.crawlTime > latestCrawlTime) {
        latestCrawlTime = data.crawlTime;
      }

      Object.assign(idToName, data.idToName);

      for (const [feedId, items] of Object.entries(data.items)) {
        if (!allItems[feedId]) {
          allItems[feedId] = [];
        }

        // Merge items (dedupe by URL)
        const existingUrls = new Set(allItems[feedId].map((i) => i.url));
        for (const item of items) {
          if (!existingUrls.has(item.url)) {
            allItems[feedId].push(item);
            existingUrls.add(item.url);
          }
        }
      }
    }

    return {
      date: targetDate,
      crawlTime: latestCrawlTime,
      items: allItems,
      idToName,
      failedIds: [],
    };
  }

  /**
   * Get latest RSS crawl data
   */
  async getLatestRssData(date?: string): Promise<RssData | null> {
    const targetDate = date || this.getToday();
    const prefix = `rss/${targetDate}/`;

    const keys = await this.listObjects(prefix);
    if (keys.length === 0) return null;

    // Get latest
    const latestKey = keys.sort().pop();
    if (!latestKey) return null;

    return this.downloadJson<RssData>(latestKey);
  }

  /**
   * Detect new RSS items
   */
  async detectNewRssItems(
    currentData: RssData,
  ): Promise<Record<string, RssItem[]>> {
    const existingData = await this.getRssData(currentData.date);
    if (!existingData) return {};

    const existingUrls = new Set<string>();
    for (const items of Object.values(existingData.items)) {
      for (const item of items) {
        existingUrls.add(item.url);
      }
    }

    const newItems: Record<string, RssItem[]> = {};
    for (const [feedId, items] of Object.entries(currentData.items)) {
      const newFeedItems = items.filter((item) => !existingUrls.has(item.url));
      if (newFeedItems.length > 0) {
        newItems[feedId] = newFeedItems;
      }
    }

    return newItems;
  }

  /**
   * Get today's all news data
   */
  async getTodayAllData(date?: string): Promise<StorageNewsData | null> {
    const targetDate = date || this.getToday();
    const prefix = `news/${targetDate}/`;

    const keys = await this.listObjects(prefix);
    if (keys.length === 0) return null;

    // Get all crawl data and merge
    const allItems: Record<string, NewsItem[]> = {};
    const idToName: Record<string, string> = {};
    let latestCrawlTime = "";

    for (const key of keys.sort()) {
      const data = await this.downloadJson<StorageNewsData>(key);
      if (!data) continue;

      if (data.crawlTime > latestCrawlTime) {
        latestCrawlTime = data.crawlTime;
      }

      Object.assign(idToName, data.idToName);

      for (const [sourceId, items] of Object.entries(data.items)) {
        if (!allItems[sourceId]) {
          allItems[sourceId] = [];
        }

        // Merge items (dedupe by title)
        const existingTitles = new Map(
          allItems[sourceId].map((i) => [i.title, i]),
        );

        for (const item of items) {
          const existing = existingTitles.get(item.title);
          if (existing) {
            // Merge ranks
            const ranks = [...new Set([...existing.ranks, ...item.ranks])].sort(
              (a, b) => a - b,
            );
            existing.ranks = ranks;

            // Update times
            if (item.firstCrawlTime < existing.firstCrawlTime) {
              existing.firstCrawlTime = item.firstCrawlTime;
            }
            if (item.lastCrawlTime > existing.lastCrawlTime) {
              existing.lastCrawlTime = item.lastCrawlTime;
            }

            existing.crawlCount += 1;
          } else {
            allItems[sourceId].push({ ...item });
            existingTitles.set(item.title, item);
          }
        }
      }
    }

    return {
      date: targetDate,
      crawlTime: latestCrawlTime,
      items: allItems,
      idToName,
      failedIds: [],
    };
  }

  /**
   * Get latest crawl data
   */
  async getLatestCrawlData(date?: string): Promise<StorageNewsData | null> {
    const targetDate = date || this.getToday();
    const prefix = `news/${targetDate}/`;

    const keys = await this.listObjects(prefix);
    if (keys.length === 0) return null;

    // Get latest
    const latestKey = keys.sort().pop();
    if (!latestKey) return null;

    return this.downloadJson<StorageNewsData>(latestKey);
  }

  /**
   * Detect new titles
   */
  async detectNewTitles(
    currentData: StorageNewsData,
  ): Promise<Record<string, Record<string, unknown>>> {
    const existingData = await this.getTodayAllData(currentData.date);
    if (!existingData) return {};

    const existingTitles = new Set<string>();
    for (const [sourceId, items] of Object.entries(existingData.items)) {
      for (const item of items) {
        existingTitles.add(`${sourceId}:${item.title}`);
      }
    }

    const newTitles: Record<string, Record<string, unknown>> = {};
    for (const [sourceId, items] of Object.entries(currentData.items)) {
      for (const item of items) {
        const key = `${sourceId}:${item.title}`;
        if (!existingTitles.has(key)) {
          if (!newTitles[sourceId]) {
            newTitles[sourceId] = {};
          }
          newTitles[sourceId][item.title] = {
            ranks: item.ranks,
            url: item.url,
            mobileUrl: item.mobileUrl,
          };
        }
      }
    }

    return newTitles;
  }

  /**
   * Save TXT snapshot (not supported for remote)
   */
  async saveTxtSnapshot(_data: StorageNewsData): Promise<string | null> {
    return null;
  }

  /**
   * Save HTML report
   */
  async saveHtmlReport(
    htmlContent: string,
    filename: string,
    _isSummary = false,
  ): Promise<string | null> {
    if (!this.enableHtml) return null;

    try {
      const key = `html/${filename}`;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: htmlContent,
          ContentType: "text/html; charset=utf-8",
        }),
      );
      return key;
    } catch (error) {
      logger.error({ err: error }, "Failed to save HTML report");
      return null;
    }
  }

  /**
   * Check if this is the first crawl today
   */
  async isFirstCrawlToday(date?: string): Promise<boolean> {
    const targetDate = date || this.getToday();
    const prefix = `news/${targetDate}/`;
    const keys = await this.listObjects(prefix);
    return keys.length <= 1;
  }

  /**
   * Check if today has been pushed
   */
  async hasPushedToday(date?: string): Promise<boolean> {
    const targetDate = date || this.getToday();
    const key = `push_records/${targetDate}.json`;
    const data = await this.downloadJson<{ pushed: boolean }>(key);
    return data?.pushed === true;
  }

  /**
   * Record a push
   */
  async recordPush(reportType: string, date?: string): Promise<boolean> {
    const targetDate = date || this.getToday();
    const key = `push_records/${targetDate}.json`;

    return this.uploadJson(key, {
      pushed: true,
      pushTime: this.getCurrentTimeDisplay(),
      reportType,
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // S3 client doesn't need explicit cleanup
  }

  /**
   * Cleanup old data
   */
  async cleanupOldData(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    let deletedCount = 0;

    // Get all date folders
    for (const prefix of ["news/", "rss/", "html/", "push_records/"]) {
      const keys = await this.listObjects(prefix);

      for (const key of keys) {
        // Extract date from key
        const match = key.match(/\d{4}-\d{2}-\d{2}/);
        if (match && match[0] < cutoffStr) {
          try {
            await this.client.send(
              new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key,
              }),
            );
            deletedCount++;
          } catch (error) {
            logger.error({ err: error, key }, "Failed to delete S3 object");
          }
        }
      }
    }

    if (deletedCount > 0) {
      logger.info(`Deleted ${deletedCount} old S3 objects`);
    }

    return deletedCount;
  }

  /**
   * Pull recent days of data to local directory
   */
  async pullRecentDays(days: number, localDir: string): Promise<number> {
    // This would download data from S3 to local SQLite
    // Implementation depends on specific needs
    logger.info(
      `Pull ${days} days of data to ${localDir} - not fully implemented`,
    );
    return 0;
  }
}

export default RemoteStorageBackend;
