/**
 * Subscriber Storage
 *
 * SQLite backend for bot subscribers using Bun's built-in SQLite.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database as BunSqliteDatabase } from 'bun:sqlite';
import { logger } from '../../utils/logger.js';

type SqliteStatement = ReturnType<BunSqliteDatabase['query']>;

/**
 * Compatibility wrapper for bun:sqlite
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
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Subscriber record
 */
export interface Subscriber {
  id: number;
  telegramUserId: number;
  chatId: number;
  username: string | null;
  firstName: string | null;
  isSubscribed: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastReportSentAt: string | null;
  reportCount: number;
}

/**
 * Report request record
 */
export interface ReportRequest {
  id: number;
  subscriberId: number;
  requestedAt: string;
}

/**
 * Subscriber Storage class
 */
export class SubscriberStorage {
  private db: SqliteCompatDatabase | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize database connection and schema
   */
  initialize(): void {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new SqliteCompatDatabase(this.dbPath);
    this.initSchema();
    logger.info(`[Bot] Subscriber storage initialized: ${this.dbPath}`);
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id INTEGER NOT NULL UNIQUE,
        chat_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        is_subscribed INTEGER DEFAULT 1,
        is_admin INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_report_sent_at TIMESTAMP,
        report_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS report_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriber_id INTEGER NOT NULL,
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
      );

      CREATE INDEX IF NOT EXISTS idx_subscribers_telegram_id ON subscribers(telegram_user_id);
      CREATE INDEX IF NOT EXISTS idx_subscribers_subscribed ON subscribers(is_subscribed);
      CREATE INDEX IF NOT EXISTS idx_report_requests_subscriber ON report_requests(subscriber_id);
      CREATE INDEX IF NOT EXISTS idx_report_requests_time ON report_requests(requested_at);
    `);
  }

  /**
   * Get database instance
   */
  private getDb(): SqliteCompatDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Create or update a subscriber
   */
  createOrUpdate(data: {
    telegramUserId: number;
    chatId: number;
    username?: string | null;
    firstName?: string | null;
  }): Subscriber | null {
    try {
      const db = this.getDb();

      const existing = this.getByTelegramId(data.telegramUserId);

      if (existing) {
        // Update existing subscriber
        db.prepare(`
          UPDATE subscribers
          SET chat_id = ?, username = ?, first_name = ?, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_user_id = ?
        `).run(data.chatId, data.username ?? null, data.firstName ?? null, data.telegramUserId);

        return this.getByTelegramId(data.telegramUserId);
      }

      // Create new subscriber
      db.prepare(`
        INSERT INTO subscribers (telegram_user_id, chat_id, username, first_name)
        VALUES (?, ?, ?, ?)
      `).run(data.telegramUserId, data.chatId, data.username ?? null, data.firstName ?? null);

      return this.getByTelegramId(data.telegramUserId);
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to create/update subscriber');
      return null;
    }
  }

  /**
   * Get subscriber by Telegram user ID
   */
  getByTelegramId(telegramUserId: number): Subscriber | null {
    try {
      const db = this.getDb();
      const row = db
        .prepare(`
        SELECT * FROM subscribers WHERE telegram_user_id = ?
      `)
        .get(telegramUserId) as Record<string, unknown> | undefined;

      if (!row) return null;

      return this.mapRowToSubscriber(row);
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to get subscriber');
      return null;
    }
  }

  /**
   * Get subscriber by ID
   */
  getById(id: number): Subscriber | null {
    try {
      const db = this.getDb();
      const row = db
        .prepare(`
        SELECT * FROM subscribers WHERE id = ?
      `)
        .get(id) as Record<string, unknown> | undefined;

      if (!row) return null;

      return this.mapRowToSubscriber(row);
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to get subscriber by id');
      return null;
    }
  }

  /**
   * Update subscription status
   */
  updateSubscription(telegramUserId: number, isSubscribed: boolean): boolean {
    try {
      const db = this.getDb();
      db.prepare(`
        UPDATE subscribers
        SET is_subscribed = ?, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_user_id = ?
      `).run(isSubscribed ? 1 : 0, telegramUserId);

      return true;
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to update subscription');
      return false;
    }
  }

  /**
   * Update admin status
   */
  updateAdmin(telegramUserId: number, isAdmin: boolean): boolean {
    try {
      const db = this.getDb();
      db.prepare(`
        UPDATE subscribers
        SET is_admin = ?, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_user_id = ?
      `).run(isAdmin ? 1 : 0, telegramUserId);

      return true;
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to update admin status');
      return false;
    }
  }

  /**
   * Get all active subscribers
   */
  getActiveSubscribers(): Subscriber[] {
    try {
      const db = this.getDb();
      const rows = db
        .prepare(`
        SELECT * FROM subscribers WHERE is_subscribed = 1
      `)
        .all() as Record<string, unknown>[];

      return rows.map((row) => this.mapRowToSubscriber(row));
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to get active subscribers');
      return [];
    }
  }

  /**
   * Get all subscribers (including unsubscribed)
   */
  getAllSubscribers(): Subscriber[] {
    try {
      const db = this.getDb();
      const rows = db
        .prepare(`
        SELECT * FROM subscribers ORDER BY created_at DESC
      `)
        .all() as Record<string, unknown>[];

      return rows.map((row) => this.mapRowToSubscriber(row));
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to get all subscribers');
      return [];
    }
  }

  /**
   * Record a report request
   */
  recordReportRequest(subscriberId: number): boolean {
    try {
      const db = this.getDb();
      db.prepare(`
        INSERT INTO report_requests (subscriber_id)
        VALUES (?)
      `).run(subscriberId);

      // Update subscriber's last report time and count
      db.prepare(`
        UPDATE subscribers
        SET last_report_sent_at = CURRENT_TIMESTAMP,
            report_count = report_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(subscriberId);

      return true;
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to record report request');
      return false;
    }
  }

  /**
   * Get recent report requests for a subscriber
   */
  getRecentReportRequests(subscriberId: number, withinMinutes: number): ReportRequest[] {
    try {
      const db = this.getDb();
      const rows = db
        .prepare(`
        SELECT * FROM report_requests
        WHERE subscriber_id = ?
          AND requested_at > datetime('now', '-' || ? || ' minutes')
        ORDER BY requested_at DESC
      `)
        .all(subscriberId, withinMinutes) as Record<string, unknown>[];

      return rows.map((row) => ({
        id: row.id as number,
        subscriberId: row.subscriber_id as number,
        requestedAt: row.requested_at as string,
      }));
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to get recent report requests');
      return [];
    }
  }

  /**
   * Count report requests in the last hour
   */
  countReportRequestsInLastHour(subscriberId: number): number {
    try {
      const db = this.getDb();
      const result = db
        .prepare(`
        SELECT COUNT(*) as count FROM report_requests
        WHERE subscriber_id = ?
          AND requested_at > datetime('now', '-60 minutes')
      `)
        .get(subscriberId) as { count: number };

      return result.count;
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to count report requests');
      return 0;
    }
  }

  /**
   * Get subscriber statistics
   */
  getStats(): {
    totalSubscribers: number;
    activeSubscribers: number;
    totalReports: number;
  } {
    try {
      const db = this.getDb();

      const totalResult = db
        .prepare(`
        SELECT COUNT(*) as count FROM subscribers
      `)
        .get() as { count: number };

      const activeResult = db
        .prepare(`
        SELECT COUNT(*) as count FROM subscribers WHERE is_subscribed = 1
      `)
        .get() as { count: number };

      const reportsResult = db
        .prepare(`
        SELECT COUNT(*) as count FROM report_requests
      `)
        .get() as { count: number };

      return {
        totalSubscribers: totalResult.count,
        activeSubscribers: activeResult.count,
        totalReports: reportsResult.count,
      };
    } catch (error) {
      logger.error({ error }, '[Bot] Failed to get stats');
      return { totalSubscribers: 0, activeSubscribers: 0, totalReports: 0 };
    }
  }

  /**
   * Map database row to Subscriber object
   */
  private mapRowToSubscriber(row: Record<string, unknown>): Subscriber {
    return {
      id: row.id as number,
      telegramUserId: row.telegram_user_id as number,
      chatId: row.chat_id as number,
      username: row.username as string | null,
      firstName: row.first_name as string | null,
      isSubscribed: (row.is_subscribed as number) === 1,
      isAdmin: (row.is_admin as number) === 1,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastReportSentAt: row.last_report_sent_at as string | null,
      reportCount: row.report_count as number,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('[Bot] Subscriber storage closed');
    }
  }
}

export default SubscriberStorage;
