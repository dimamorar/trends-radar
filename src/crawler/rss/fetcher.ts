/**
 * RSS Fetcher
 *
 * Fetches and processes RSS feeds with freshness filtering
 */

import axios, { type AxiosInstance } from "axios";
import type { ParsedRssItem, RssItem } from "../../types/rss.js";
import { logger } from "../../utils/logger.js";
import { getConfiguredTime } from "../../utils/time.js";
import { RssParser } from "./parser.js";

/**
 * RSS feed configuration for fetcher
 */
export interface FetcherFeedConfig {
  id: string;
  name: string;
  url: string;
  maxItems?: number;
  enabled?: boolean;
  maxAgeDays?: number | null;
}

/**
 * RSS fetch result
 */
export interface RssFetchResult {
  items: Map<string, RssItem[]>;
  idToName: Map<string, string>;
  failedIds: string[];
  date: string;
  crawlTime: string;
}

/**
 * RSS Fetcher class
 */
export class RssFetcher {
  private feeds: FetcherFeedConfig[];
  private requestInterval: number;
  private timeout: number;
  private timezone: string;
  private parser: RssParser;
  private client: AxiosInstance;

  constructor(options: {
    feeds: FetcherFeedConfig[];
    requestInterval?: number;
    timeout?: number;
    timezone?: string;
    freshnessEnabled?: boolean;
    defaultMaxAgeDays?: number;
  }) {
    // Filter to only enabled feeds
    this.feeds = (options.feeds || []).filter((f) => f.enabled !== false);
    this.requestInterval = options.requestInterval ?? 2000;
    this.timeout = options.timeout ?? 15;
    this.timezone = options.timezone ?? "Europe/Kyiv";

    this.parser = new RssParser();
    this.client = this.createClient();
  }

  /**
   * Create HTTP client with optional proxy
   */
  private createClient(): AxiosInstance {
    const config: Record<string, unknown> = {
      timeout: this.timeout * 1000,
      headers: {
        "User-Agent":
          "TrendRadar/2.0 RSS Reader (https://github.com/trendradar)",
        Accept:
          "application/feed+json, application/json, application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Accept-Language": "en-US,en;q=0.9,uk;q=0.8",
      },
    };

    return axios.create(config);
  }

  /**
   * Fetch single RSS feed
   */
  async fetchFeed(
    feed: FetcherFeedConfig
  ): Promise<{ items: RssItem[]; error?: string }> {
    try {
      const response = await this.client.get<string>(feed.url, {
        responseType: "text",
      });

      const parsedItems = await this.parser.parse(response.data, feed.url);

      // Limit items if specified (0 = no limit)
      const limitedItems =
        feed.maxItems && feed.maxItems > 0
          ? parsedItems.slice(0, feed.maxItems)
          : parsedItems;

      // Convert to RssItem format
      const now = getConfiguredTime(this.timezone);
      const crawlTime = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")}`;

      const items: RssItem[] = limitedItems.map((parsed: ParsedRssItem) => ({
        feedId: feed.id,
        feedName: feed.name,
        title: parsed.title,
        url: parsed.link,
        publishedAt: parsed.pubDate,
        summary: parsed.summary,
        author: parsed.author,
        guid: parsed.guid,
        firstCrawlTime: crawlTime,
        lastCrawlTime: crawlTime,
        crawlCount: 1,
      }));

      logger.info(`[RSS] ${feed.name}: fetched ${items.length} items`);
      return { items };
    } catch (error) {
      let errorMsg: string;

      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          errorMsg = `Request timeout (${this.timeout}s)`;
        } else {
          errorMsg = `Request failed: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMsg = `Parse failed: ${error.message}`;
      } else {
        errorMsg = `Unknown error: ${String(error)}`;
      }

      logger.error(`[RSS] ${feed.name}: ${errorMsg}`);
      return { items: [], error: errorMsg };
    }
  }

  /**
   * Fetch all RSS feeds
   */
  async fetchAll(): Promise<RssFetchResult> {
    const allItems: Map<string, RssItem[]> = new Map();
    const idToName: Map<string, string> = new Map();
    const failedIds: string[] = [];

    const now = getConfiguredTime(this.timezone);
    const crawlTime = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
    const crawlDate = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    logger.info(`[RSS] Starting fetch of ${this.feeds.length} feeds...`);

    for (let i = 0; i < this.feeds.length; i++) {
      const feed = this.feeds[i];

      // Request interval with jitter
      if (i > 0) {
        const interval = this.requestInterval;
        const jitter = (Math.random() - 0.5) * 0.4 * interval;
        await this.sleep(interval + jitter);
      }

      const { items, error } = await this.fetchFeed(feed);

      idToName.set(feed.id, feed.name);

      if (error) {
        failedIds.push(feed.id);
      } else {
        allItems.set(feed.id, items);
      }
    }

    const totalItems = Array.from(allItems.values()).reduce(
      (sum, items) => sum + items.length,
      0
    );
    logger.info(
      `[RSS] Fetch complete: ${allItems.size} feeds succeeded, ${failedIds.length} failed, ${totalItems} total items`
    );

    return {
      items: allItems,
      idToName,
      failedIds,
      date: crawlDate,
      crawlTime,
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create fetcher from config
   */
  static fromConfig(
    config: {
      enabled?: boolean;
      requestInterval?: number;
      timeout?: number;
      freshnessFilter?: {
        enabled?: boolean;
        maxAgeDays?: number;
      };
      feeds?: Array<{
        id: string;
        name: string;
        url: string;
        maxItems?: number;
        enabled?: boolean;
        maxAgeDays?: number | null;
      }>;
    },
    timezone?: string
  ): RssFetcher {
    const freshnessConfig = config.freshnessFilter || {};
    const freshnessEnabled = freshnessConfig.enabled ?? true;
    const defaultMaxAgeDays = freshnessConfig.maxAgeDays ?? 3;

    const feeds: FetcherFeedConfig[] = [];
    for (const feedConfig of config.feeds || []) {
      let maxAgeDays: number | null = null;
      if (
        feedConfig.maxAgeDays !== undefined &&
        feedConfig.maxAgeDays !== null
      ) {
        const parsed = Number(feedConfig.maxAgeDays);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          maxAgeDays = parsed;
        } else if (parsed < 0) {
          logger.warn(
            `[Warning] RSS feed '${feedConfig.id}' has negative maxAgeDays, using global default`
          );
        } else {
          logger.warn(
            `[Warning] RSS feed '${feedConfig.id}' has invalid maxAgeDays: ${feedConfig.maxAgeDays}`
          );
        }
      }

      const feed: FetcherFeedConfig = {
        id: feedConfig.id || "",
        name: feedConfig.name || "",
        url: feedConfig.url || "",
        maxItems: feedConfig.maxItems || 0,
        enabled: feedConfig.enabled ?? true,
        maxAgeDays,
      };

      if (feed.id && feed.url) {
        feeds.push(feed);
      }
    }

    return new RssFetcher({
      feeds,
      requestInterval: config.requestInterval ?? 2000,
      timeout: config.timeout ?? 15,
      timezone: timezone ?? "Europe/Kyiv",
      freshnessEnabled,
      defaultMaxAgeDays,
    });
  }
}

export default RssFetcher;
