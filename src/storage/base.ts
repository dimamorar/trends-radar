/**
 * Storage backend abstract base and data models
 *
 * Defines unified storage interface that all backends must implement.
 */

import type { NewsItem, RssItem } from '../types/index.js';

/**
 * RSS data collection
 */
export interface RssData {
  date: string;
  crawlTime: string;
  items: Record<string, RssItem[]>;
  idToName: Record<string, string>;
  failedIds: string[];
}

/**
 * News data with items as a record
 */
export interface StorageNewsData {
  date: string;
  crawlTime: string;
  items: Record<string, NewsItem[]>;
  idToName: Record<string, string>;
  failedIds: string[];
}

/**
 * Storage backend interface
 *
 * All storage backends must implement these methods to support:
 * - Save news data
 * - Read today's all data
 * - Detect new news
 * - Generate report files (TXT/HTML)
 */
export interface StorageBackend {
  /**
   * Backend name
   */
  readonly backendName: string;

  /**
   * Whether TXT snapshots are supported
   */
  readonly supportsTxt: boolean;

  /**
   * Save news data
   */
  saveNewsData(data: StorageNewsData): Promise<boolean>;

  /**
   * Save RSS data
   */
  saveRssData(data: RssData): Promise<boolean>;

  /**
   * Get all RSS data for a date
   */
  getRssData(date?: string): Promise<RssData | null>;

  /**
   * Get latest RSS crawl data
   */
  getLatestRssData(date?: string): Promise<RssData | null>;

  /**
   * Detect new RSS items
   */
  detectNewRssItems(currentData: RssData): Promise<Record<string, RssItem[]>>;

  /**
   * Get all news data for a date
   */
  getTodayAllData(date?: string): Promise<StorageNewsData | null>;

  /**
   * Get latest crawl data
   */
  getLatestCrawlData(date?: string): Promise<StorageNewsData | null>;

  /**
   * Detect new titles
   */
  detectNewTitles(currentData: StorageNewsData): Promise<Record<string, Record<string, unknown>>>;

  /**
   * Save TXT snapshot
   */
  saveTxtSnapshot(data: StorageNewsData): Promise<string | null>;

  /**
   * Save HTML report
   */
  saveHtmlReport(
    htmlContent: string,
    filename: string,
    isSummary?: boolean,
  ): Promise<string | null>;

  /**
   * Check if this is the first crawl today
   */
  isFirstCrawlToday(date?: string): Promise<boolean>;

  /**
   * Check if today has been pushed
   */
  hasPushedToday(date?: string): Promise<boolean>;

  /**
   * Record a push
   */
  recordPush(reportType: string, date?: string): Promise<boolean>;

  /**
   * Cleanup resources
   */
  cleanup(): Promise<void>;

  /**
   * Cleanup old data
   */
  cleanupOldData(retentionDays: number): Promise<number>;
}

/**
 * Convert crawl results to StorageNewsData format
 */
export function convertCrawlResultsToNewsData(
  results: Record<string, Record<string, { ranks: number[]; url?: string; mobileUrl?: string }>>,
  idToName: Record<string, string>,
  failedIds: string[],
  crawlTime: string,
  crawlDate: string,
): StorageNewsData {
  const items: Record<string, NewsItem[]> = {};

  for (const [sourceId, titlesData] of Object.entries(results)) {
    const newsList: NewsItem[] = [];

    for (const [title, data] of Object.entries(titlesData)) {
      const ranks = data.ranks || [];
      const rank = ranks[0] || 99;

      newsList.push({
        title,
        platformId: sourceId,
        rank,
        ranks,
        url: data.url || '',
        mobileUrl: data.mobileUrl || '',
        firstCrawlTime: crawlTime,
        lastCrawlTime: crawlTime,
        crawlCount: 1,
      });
    }

    items[sourceId] = newsList;
  }

  return {
    date: crawlDate,
    crawlTime,
    items,
    idToName,
    failedIds,
  };
}

/**
 * Convert StorageNewsData to crawl results format
 */
export function convertNewsDataToResults(data: StorageNewsData): {
  results: Record<string, Record<string, { ranks: number[]; url?: string; mobileUrl?: string }>>;
  idToName: Record<string, string>;
  titleInfo: Record<
    string,
    Record<
      string,
      {
        firstTime: string;
        lastTime: string;
        count: number;
        ranks: number[];
        url?: string;
        mobileUrl?: string;
      }
    >
  >;
} {
  const results: Record<
    string,
    Record<string, { ranks: number[]; url?: string; mobileUrl?: string }>
  > = {};
  const titleInfo: Record<
    string,
    Record<
      string,
      {
        firstTime: string;
        lastTime: string;
        count: number;
        ranks: number[];
        url?: string;
        mobileUrl?: string;
      }
    >
  > = {};

  for (const [sourceId, newsList] of Object.entries(data.items)) {
    results[sourceId] = {};
    titleInfo[sourceId] = {};

    for (const item of newsList) {
      results[sourceId][item.title] = {
        ranks: item.ranks,
        url: item.url,
        mobileUrl: item.mobileUrl,
      };

      titleInfo[sourceId][item.title] = {
        firstTime: item.firstCrawlTime,
        lastTime: item.lastCrawlTime,
        count: item.crawlCount,
        ranks: item.ranks,
        url: item.url,
        mobileUrl: item.mobileUrl,
      };
    }
  }

  return { results, idToName: data.idToName, titleInfo };
}

/**
 * Merge two NewsData objects
 */
export function mergeNewsData(
  existing: StorageNewsData,
  newData: StorageNewsData,
): StorageNewsData {
  const mergedItems: Record<string, Record<string, NewsItem>> = {};

  // Copy existing data
  for (const [sourceId, newsList] of Object.entries(existing.items)) {
    mergedItems[sourceId] = {};
    for (const item of newsList) {
      mergedItems[sourceId][item.title] = { ...item };
    }
  }

  // Merge new data
  for (const [sourceId, newsList] of Object.entries(newData.items)) {
    if (!mergedItems[sourceId]) {
      mergedItems[sourceId] = {};
    }

    for (const item of newsList) {
      if (mergedItems[sourceId][item.title]) {
        // Merge existing news
        const existingItem = mergedItems[sourceId][item.title];

        // Merge ranks
        const existingRanks = new Set(existingItem.ranks || []);
        const newRanks = new Set(item.ranks || []);
        existingItem.ranks = [...new Set([...existingRanks, ...newRanks])].sort((a, b) => a - b);

        // Update times
        if (
          item.firstCrawlTime &&
          (!existingItem.firstCrawlTime || item.firstCrawlTime < existingItem.firstCrawlTime)
        ) {
          existingItem.firstCrawlTime = item.firstCrawlTime;
        }
        if (
          item.lastCrawlTime &&
          (!existingItem.lastCrawlTime || item.lastCrawlTime > existingItem.lastCrawlTime)
        ) {
          existingItem.lastCrawlTime = item.lastCrawlTime;
        }

        // Update count
        existingItem.crawlCount += 1;

        // Preserve URL if missing
        if (!existingItem.url && item.url) {
          existingItem.url = item.url;
        }
        if (!existingItem.mobileUrl && item.mobileUrl) {
          existingItem.mobileUrl = item.mobileUrl;
        }
      } else {
        // Add new news
        mergedItems[sourceId][item.title] = { ...item };
      }
    }
  }

  // Convert back to list format
  const finalItems: Record<string, NewsItem[]> = {};
  for (const [sourceId, itemsDict] of Object.entries(mergedItems)) {
    finalItems[sourceId] = Object.values(itemsDict);
  }

  return {
    date: existing.date || newData.date,
    crawlTime: newData.crawlTime,
    items: finalItems,
    idToName: { ...existing.idToName, ...newData.idToName },
    failedIds: [...new Set([...existing.failedIds, ...newData.failedIds])],
  };
}

/**
 * Get total count from NewsData
 */
export function getNewsDataTotalCount(data: StorageNewsData): number {
  return Object.values(data.items).reduce((sum, newsList) => sum + newsList.length, 0);
}

/**
 * Get total count from RssData
 */
export function getRssDataTotalCount(data: RssData): number {
  return Object.values(data.items).reduce((sum, itemsList) => sum + itemsList.length, 0);
}
