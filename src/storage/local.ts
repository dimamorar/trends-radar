/**
 * Local SQLite storage backend
 *
 * Uses Bun's built-in SQLite (`bun:sqlite`) for synchronous database operations.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database as BunSqliteDatabase } from "bun:sqlite";
import type { NewsItem, RssItem } from "../types/index.js";
import { logger } from "../utils/logger.js";
import {
  formatDateFolder,
  formatDateInTimezone,
  formatTimeFilename,
  getCurrentTimeDisplay,
} from "../utils/time.js";
import type { RssData, StorageBackend, StorageNewsData } from "./base.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type SqliteStatement = ReturnType<BunSqliteDatabase["query"]>;

/**
 * Compatibility wrapper so the rest of this file can keep using
 * the `better-sqlite3`-style API (`prepare`, `transaction`, `exec`, `close`).
 */
class SqliteCompatDatabase {
  private db: BunSqliteDatabase;

  constructor(filename: string) {
    this.db = new BunSqliteDatabase(filename);
  }

  prepare(sql: string): SqliteStatement {
    return this.db.query(sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Local SQLite storage backend
 */
export class LocalStorageBackend implements StorageBackend {
  private dataDir: string;
  private enableTxt: boolean;
  private enableHtml: boolean;
  private timezone: string;
  private newsDb: SqliteCompatDatabase | null = null;
  private rssDb: SqliteCompatDatabase | null = null;
  private currentDate: string | null = null;

  readonly backendName = "local";
  readonly supportsTxt = true;

  constructor(
    options: {
      dataDir?: string;
      enableTxt?: boolean;
      enableHtml?: boolean;
      timezone?: string;
    } = {}
  ) {
    this.dataDir = options.dataDir || "output";
    this.enableTxt = options.enableTxt ?? false;
    this.enableHtml = options.enableHtml ?? true;
    this.timezone = options.timezone || "Europe/Kyiv";
  }

  /**
   * Get today's date string
   */
  private getToday(): string {
    return formatDateFolder(this.timezone);
  }

  /**
   * Get current time string
   */
  private getCurrentTime(): string {
    return formatTimeFilename(this.timezone);
  }

  /**
   * Get current time display (HH:MM)
   */
  private getCurrentTimeDisplay(): string {
    return getCurrentTimeDisplay(this.timezone);
  }

  /**
   * Get news database path for a date
   */
  private getNewsDbPath(date?: string): string {
    const targetDate = date || this.getToday();
    return join(this.dataDir, "news", `${targetDate}.db`);
  }

  /**
   * Get RSS database path for a date
   */
  private getRssDbPath(date?: string): string {
    const targetDate = date || this.getToday();
    return join(this.dataDir, "rss", `${targetDate}.db`);
  }

  /**
   * Get or create news database
   */
  private getNewsDb(date?: string): SqliteCompatDatabase {
    const targetDate = date || this.getToday();

    // Return cached connection if same date
    if (this.newsDb && this.currentDate === targetDate) {
      return this.newsDb;
    }

    // Close existing connection
    if (this.newsDb) {
      this.newsDb.close();
    }

    const dbPath = this.getNewsDbPath(targetDate);
    const dir = dirname(dbPath);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Create database
    this.newsDb = new SqliteCompatDatabase(dbPath);
    this.currentDate = targetDate;

    // Initialize schema
    this.initNewsSchema(this.newsDb);

    return this.newsDb;
  }

  /**
   * Get or create RSS database
   */
  private getRssDb(date?: string): SqliteCompatDatabase {
    const targetDate = date || this.getToday();

    // Close existing connection
    if (this.rssDb) {
      this.rssDb.close();
    }

    const dbPath = this.getRssDbPath(targetDate);
    const dir = dirname(dbPath);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Create database
    this.rssDb = new SqliteCompatDatabase(dbPath);

    // Initialize schema
    this.initRssSchema(this.rssDb);

    return this.rssDb;
  }

  /**
   * Initialize news database schema
   */
  private initNewsSchema(db: SqliteCompatDatabase): void {
    const schemaPath = join(__dirname, "schema.sql");
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, "utf-8");
      db.exec(schema);
    } else {
      // Inline schema as fallback
      db.exec(`
        CREATE TABLE IF NOT EXISTS platforms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS news_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          platform_id TEXT NOT NULL,
          rank INTEGER NOT NULL,
          url TEXT DEFAULT '',
          mobile_url TEXT DEFAULT '',
          first_crawl_time TEXT NOT NULL,
          last_crawl_time TEXT NOT NULL,
          crawl_count INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (platform_id) REFERENCES platforms(id)
        );

        CREATE TABLE IF NOT EXISTS rank_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          news_item_id INTEGER NOT NULL,
          rank INTEGER NOT NULL,
          crawl_time TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (news_item_id) REFERENCES news_items(id)
        );

        CREATE TABLE IF NOT EXISTS crawl_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          crawl_time TEXT NOT NULL UNIQUE,
          total_items INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS push_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL UNIQUE,
          pushed INTEGER DEFAULT 0,
          push_time TEXT,
          report_type TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_news_platform ON news_items(platform_id);
        CREATE INDEX IF NOT EXISTS idx_news_crawl_time ON news_items(last_crawl_time);
        CREATE INDEX IF NOT EXISTS idx_news_title ON news_items(title);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_news_url_platform ON news_items(url, platform_id) WHERE url != '';
      `);
    }
  }

  /**
   * Initialize RSS database schema
   */
  private initRssSchema(db: SqliteCompatDatabase): void {
    const schemaPath = join(__dirname, "rss_schema.sql");
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, "utf-8");
      db.exec(schema);
    } else {
      // Inline schema as fallback
      db.exec(`
        CREATE TABLE IF NOT EXISTS rss_feeds (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          feed_url TEXT DEFAULT '',
          is_active INTEGER DEFAULT 1,
          last_fetch_time TEXT,
          last_fetch_status TEXT,
          item_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rss_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          feed_id TEXT NOT NULL,
          url TEXT NOT NULL,
          published_at TEXT,
          summary TEXT,
          author TEXT,
          first_crawl_time TEXT NOT NULL,
          last_crawl_time TEXT NOT NULL,
          crawl_count INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (feed_id) REFERENCES rss_feeds(id)
        );

        CREATE TABLE IF NOT EXISTS rss_crawl_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          crawl_time TEXT NOT NULL UNIQUE,
          total_items INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rss_push_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL UNIQUE,
          pushed INTEGER DEFAULT 0,
          push_time TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_rss_feed ON rss_items(feed_id);
        CREATE INDEX IF NOT EXISTS idx_rss_published ON rss_items(published_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_url_feed ON rss_items(url, feed_id);
      `);
    }
  }

  /**
   * Save news data to database
   */
  async saveNewsData(data: StorageNewsData): Promise<boolean> {
    try {
      const db = this.getNewsDb(data.date);
      const crawlTime = data.crawlTime || this.getCurrentTimeDisplay();

      // Record crawl
      const insertCrawl = db.prepare(`
        INSERT OR IGNORE INTO crawl_records (crawl_time, total_items)
        VALUES (?, ?)
      `);

      let totalItems = 0;
      for (const items of Object.values(data.items)) {
        totalItems += items.length;
      }

      insertCrawl.run(crawlTime, totalItems);

      // Prepare statements
      const upsertPlatform = db.prepare(`
        INSERT INTO platforms (id, name)
        VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP
      `);

      const selectNews = db.prepare(`
        SELECT id, crawl_count FROM news_items
        WHERE title = ? AND platform_id = ?
      `);

      const insertNews = db.prepare(`
        INSERT INTO news_items (title, platform_id, rank, url, mobile_url, first_crawl_time, last_crawl_time, crawl_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);

      const updateNews = db.prepare(`
        UPDATE news_items
        SET rank = ?, last_crawl_time = ?, crawl_count = ?, url = COALESCE(NULLIF(url, ''), ?), mobile_url = COALESCE(NULLIF(mobile_url, ''), ?)
        WHERE id = ?
      `);

      const insertRankHistory = db.prepare(`
        INSERT INTO rank_history (news_item_id, rank, crawl_time)
        VALUES (?, ?, ?)
      `);

      // Use transaction for batch insert
      const transaction = db.transaction(() => {
        for (const [sourceId, items] of Object.entries(data.items)) {
          const sourceName = data.idToName[sourceId] || sourceId;
          upsertPlatform.run(sourceId, sourceName);

          for (const item of items) {
            const existing = selectNews.get(item.title, sourceId) as
              | { id: number; crawl_count: number }
              | undefined;

            if (existing) {
              // Update existing
              updateNews.run(
                item.rank,
                crawlTime,
                existing.crawl_count + 1,
                item.url || "",
                item.mobileUrl || "",
                existing.id
              );
              insertRankHistory.run(existing.id, item.rank, crawlTime);
            } else {
              // Insert new
              const result = insertNews.run(
                item.title,
                sourceId,
                item.rank,
                item.url || "",
                item.mobileUrl || "",
                crawlTime,
                crawlTime
              );
              insertRankHistory.run(
                result.lastInsertRowid,
                item.rank,
                crawlTime
              );
            }
          }
        }
      });

      transaction();
      return true;
    } catch (error) {
      logger.error({ err: error }, "Failed to save news data");
      return false;
    }
  }

  /**
   * Save RSS data to database
   */
  async saveRssData(data: RssData): Promise<boolean> {
    try {
      const targetDate = data.date || this.getToday();
      const db = this.getRssDb(targetDate);
      const crawlTime = data.crawlTime || this.getCurrentTimeDisplay();

      // Record crawl
      const insertCrawl = db.prepare(`
        INSERT OR IGNORE INTO rss_crawl_records (crawl_time, total_items)
        VALUES (?, ?)
      `);

      let filteredOut = 0;
      const filteredItems: Record<string, RssItem[]> = {};

      for (const [feedId, items] of Object.entries(data.items)) {
        const kept = items.filter((item) => {
          if (!item.publishedAt) {
            filteredOut++;
            return false;
          }
          const parsed = new Date(item.publishedAt);
          if (Number.isNaN(parsed.getTime())) {
            filteredOut++;
            return false;
          }
          const itemDate = formatDateInTimezone(parsed, this.timezone);
          if (itemDate !== targetDate) {
            filteredOut++;
            return false;
          }
          return true;
        });
        filteredItems[feedId] = kept;
      }

      let totalItems = 0;
      for (const items of Object.values(filteredItems)) {
        totalItems += items.length;
      }

      insertCrawl.run(crawlTime, totalItems);

      if (filteredOut > 0) {
        logger.info(
          `[RSS] Filtered out ${filteredOut} items not published on ${targetDate}`
        );
      }

      // Prepare statements
      const upsertFeed = db.prepare(`
        INSERT INTO rss_feeds (id, name, last_fetch_time, last_fetch_status, item_count)
        VALUES (?, ?, ?, 'success', ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          last_fetch_time = excluded.last_fetch_time,
          last_fetch_status = 'success',
          item_count = excluded.item_count,
          updated_at = CURRENT_TIMESTAMP
      `);

      const selectItem = db.prepare(`
        SELECT id, crawl_count FROM rss_items
        WHERE url = ? AND feed_id = ?
      `);

      const insertItem = db.prepare(`
        INSERT INTO rss_items (title, feed_id, url, published_at, summary, author, first_crawl_time, last_crawl_time, crawl_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      const updateItem = db.prepare(`
        UPDATE rss_items
        SET title = ?, last_crawl_time = ?, crawl_count = ?
        WHERE id = ?
      `);

      // Use transaction
      const transaction = db.transaction(() => {
        for (const [feedId, items] of Object.entries(filteredItems)) {
          const feedName = data.idToName[feedId] || feedId;
          upsertFeed.run(feedId, feedName, crawlTime, items.length);

          for (const item of items) {
            const existing = selectItem.get(item.url, feedId) as
              | { id: number; crawl_count: number }
              | undefined;

            if (existing) {
              updateItem.run(
                item.title,
                crawlTime,
                existing.crawl_count + 1,
                existing.id
              );
            } else {
              insertItem.run(
                item.title,
                feedId,
                item.url,
                item.publishedAt || null,
                item.summary || null,
                item.author || null,
                crawlTime,
                crawlTime
              );
            }
          }
        }
      });

      transaction();
      return true;
    } catch (error) {
      logger.error({ err: error }, "Failed to save RSS data");
      return false;
    }
  }

  /**
   * Get RSS data for a date
   */
  async getRssData(date?: string): Promise<RssData | null> {
    const targetDate = date || this.getToday();
    const dbPath = this.getRssDbPath(targetDate);

    if (!existsSync(dbPath)) {
      return null;
    }

    try {
      const db = this.getRssDb(targetDate);

      // Get feeds
      const feeds = db
        .prepare(`SELECT id, name FROM rss_feeds WHERE is_active = 1`)
        .all() as Array<{ id: string; name: string }>;

      const idToName: Record<string, string> = {};
      for (const feed of feeds) {
        idToName[feed.id] = feed.name;
      }

      // Get items
      const items: Record<string, RssItem[]> = {};
      const selectItems = db.prepare(`
        SELECT title, feed_id, url, published_at, summary, author, first_crawl_time, last_crawl_time, crawl_count
        FROM rss_items
        ORDER BY published_at DESC
      `);

      const rows = selectItems.all() as Array<{
        title: string;
        feed_id: string;
        url: string;
        published_at: string | null;
        summary: string | null;
        author: string | null;
        first_crawl_time: string;
        last_crawl_time: string;
        crawl_count: number;
      }>;

      for (const row of rows) {
        if (!items[row.feed_id]) {
          items[row.feed_id] = [];
        }
        items[row.feed_id].push({
          feedId: row.feed_id,
          feedName: idToName[row.feed_id] || row.feed_id,
          title: row.title,
          url: row.url,
          publishedAt: row.published_at || undefined,
          summary: row.summary || undefined,
          author: row.author || undefined,
          firstCrawlTime: row.first_crawl_time,
          lastCrawlTime: row.last_crawl_time,
          crawlCount: row.crawl_count,
        });
      }

      // Get latest crawl time
      const latestCrawl = db
        .prepare(
          `SELECT crawl_time FROM rss_crawl_records ORDER BY crawl_time DESC LIMIT 1`
        )
        .get() as { crawl_time: string } | undefined;

      return {
        date: targetDate,
        crawlTime: latestCrawl?.crawl_time || "",
        items,
        idToName,
        failedIds: [],
      };
    } catch (error) {
      logger.error({ err: error }, "Failed to get RSS data");
      return null;
    }
  }

  /**
   * Get latest RSS crawl data
   */
  async getLatestRssData(date?: string): Promise<RssData | null> {
    return this.getRssData(date);
  }

  /**
   * Detect new RSS items
   */
  async detectNewRssItems(
    currentData: RssData
  ): Promise<Record<string, RssItem[]>> {
    const existingData = await this.getRssData(currentData.date);
    if (!existingData) {
      return {};
    }

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
    const dbPath = this.getNewsDbPath(targetDate);

    if (!existsSync(dbPath)) {
      return null;
    }

    try {
      const db = this.getNewsDb(targetDate);

      // Get platforms
      const platforms = db
        .prepare(`SELECT id, name FROM platforms WHERE is_active = 1`)
        .all() as Array<{ id: string; name: string }>;

      const idToName: Record<string, string> = {};
      for (const platform of platforms) {
        idToName[platform.id] = platform.name;
      }

      // Get items with rank history
      const items: Record<string, NewsItem[]> = {};

      const selectItems = db.prepare(`
        SELECT n.id, n.title, n.platform_id, n.rank, n.url, n.mobile_url,
               n.first_crawl_time, n.last_crawl_time, n.crawl_count
        FROM news_items n
        ORDER BY n.last_crawl_time DESC
      `);

      const selectRanks = db.prepare(`
        SELECT rank FROM rank_history WHERE news_item_id = ? ORDER BY crawl_time
      `);

      const rows = selectItems.all() as Array<{
        id: number;
        title: string;
        platform_id: string;
        rank: number;
        url: string | null;
        mobile_url: string | null;
        first_crawl_time: string;
        last_crawl_time: string;
        crawl_count: number;
      }>;

      for (const row of rows) {
        if (!items[row.platform_id]) {
          items[row.platform_id] = [];
        }

        // Get rank history
        const rankRows = selectRanks.all(row.id) as Array<{ rank: number }>;
        const ranks = rankRows.map((r) => r.rank);

        items[row.platform_id].push({
          title: row.title,
          platformId: row.platform_id,
          rank: row.rank,
          ranks: ranks.length > 0 ? ranks : [row.rank],
          url: row.url || undefined,
          mobileUrl: row.mobile_url || undefined,
          firstCrawlTime: row.first_crawl_time,
          lastCrawlTime: row.last_crawl_time,
          crawlCount: row.crawl_count,
        });
      }

      // Get latest crawl time
      const latestCrawl = db
        .prepare(
          `SELECT crawl_time FROM crawl_records ORDER BY crawl_time DESC LIMIT 1`
        )
        .get() as { crawl_time: string } | undefined;

      return {
        date: targetDate,
        crawlTime: latestCrawl?.crawl_time || "",
        items,
        idToName,
        failedIds: [],
      };
    } catch (error) {
      logger.error({ err: error }, "Failed to get today all data");
      return null;
    }
  }

  /**
   * Get latest crawl data
   */
  async getLatestCrawlData(date?: string): Promise<StorageNewsData | null> {
    return this.getTodayAllData(date);
  }

  /**
   * Detect new titles
   */
  async detectNewTitles(
    currentData: StorageNewsData
  ): Promise<Record<string, Record<string, unknown>>> {
    const existingData = await this.getTodayAllData(currentData.date);
    if (!existingData) {
      return {};
    }

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
   * Save TXT snapshot
   */
  async saveTxtSnapshot(data: StorageNewsData): Promise<string | null> {
    if (!this.enableTxt) return null;

    try {
      const dir = join(this.dataDir, "txt", data.date);
      mkdirSync(dir, { recursive: true });

      const filename = `${this.getCurrentTime()}.txt`;
      const filepath = join(dir, filename);

      const lines: string[] = [];
      for (const [sourceId, items] of Object.entries(data.items)) {
        const sourceName = data.idToName[sourceId] || sourceId;
        lines.push(`${sourceId} | ${sourceName}`);

        const sorted = [...items].sort((a, b) => a.rank - b.rank);
        for (const item of sorted) {
          let line = `${item.rank}. ${item.title}`;
          if (item.url) line += ` [URL:${item.url}]`;
          if (item.mobileUrl) line += ` [MOBILE:${item.mobileUrl}]`;
          lines.push(line);
        }
        lines.push("");
      }

      writeFileSync(filepath, lines.join("\n"), "utf-8");
      return filepath;
    } catch (error) {
      logger.error({ err: error }, "Failed to save TXT snapshot");
      return null;
    }
  }

  /**
   * Save HTML report
   */
  async saveHtmlReport(
    htmlContent: string,
    filename: string,
    isSummary = false
  ): Promise<string | null> {
    if (!this.enableHtml) return null;

    try {
      const dir = join(this.dataDir, "html");
      mkdirSync(dir, { recursive: true });

      const filepath = join(dir, filename);
      writeFileSync(filepath, htmlContent, "utf-8");

      // Also save as index.html if summary
      if (isSummary) {
        const indexPath = join(this.dataDir, "index.html");
        writeFileSync(indexPath, htmlContent, "utf-8");
      }

      return filepath;
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
    const dbPath = this.getNewsDbPath(targetDate);

    if (!existsSync(dbPath)) {
      return true;
    }

    try {
      const db = this.getNewsDb(targetDate);
      const count = db
        .prepare(`SELECT COUNT(*) as count FROM crawl_records`)
        .get() as {
        count: number;
      };
      return count.count <= 1;
    } catch {
      return true;
    }
  }

  /**
   * Check if today has been pushed
   */
  async hasPushedToday(date?: string): Promise<boolean> {
    const targetDate = date || this.getToday();
    const dbPath = this.getNewsDbPath(targetDate);

    if (!existsSync(dbPath)) {
      return false;
    }

    try {
      const db = this.getNewsDb(targetDate);
      const record = db
        .prepare(`SELECT pushed FROM push_records WHERE date = ?`)
        .get(targetDate) as { pushed: number } | undefined;
      return record?.pushed === 1;
    } catch {
      return false;
    }
  }

  /**
   * Record a push
   */
  async recordPush(reportType: string, date?: string): Promise<boolean> {
    const targetDate = date || this.getToday();

    try {
      const db = this.getNewsDb(targetDate);
      db.prepare(
        `
        INSERT INTO push_records (date, pushed, push_time, report_type)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          pushed = 1,
          push_time = excluded.push_time,
          report_type = excluded.report_type
      `
      ).run(targetDate, this.getCurrentTimeDisplay(), reportType);
      return true;
    } catch (error) {
      logger.error({ err: error }, "Failed to record push");
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.newsDb) {
      this.newsDb.close();
      this.newsDb = null;
    }
    if (this.rssDb) {
      this.rssDb.close();
      this.rssDb = null;
    }
    this.currentDate = null;
  }

  /**
   * Cleanup old data
   */
  async cleanupOldData(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) return 0;

    let deletedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    // Cleanup news databases
    const newsDir = join(this.dataDir, "news");
    if (existsSync(newsDir)) {
      const files = readdirSync(newsDir);
      for (const file of files) {
        if (file.endsWith(".db")) {
          const dateStr = file.replace(".db", "");
          if (dateStr < cutoffStr) {
            rmSync(join(newsDir, file));
            deletedCount++;
            logger.info(`Deleted old news database: ${file}`);
          }
        }
      }
    }

    // Cleanup RSS databases
    const rssDir = join(this.dataDir, "rss");
    if (existsSync(rssDir)) {
      const files = readdirSync(rssDir);
      for (const file of files) {
        if (file.endsWith(".db")) {
          const dateStr = file.replace(".db", "");
          if (dateStr < cutoffStr) {
            rmSync(join(rssDir, file));
            deletedCount++;
            logger.info(`Deleted old RSS database: ${file}`);
          }
        }
      }
    }

    return deletedCount;
  }
}

export default LocalStorageBackend;
