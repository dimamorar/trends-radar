/**
 * Subscriber Service
 *
 * Business logic layer for managing bot subscribers.
 */

import type { SubscriberStorage, Subscriber } from '../storage/subscriber.js';
import { logger } from '../../utils/logger.js';

/**
 * Subscriber Service class
 */
export class SubscriberService {
  private storage: SubscriberStorage;
  private adminUserIds: number[];

  constructor(storage: SubscriberStorage, adminUserIds: number[] = []) {
    this.storage = storage;
    this.adminUserIds = adminUserIds;
  }

  /**
   * Register a new user or update existing
   */
  register(data: {
    telegramUserId: number;
    chatId: number;
    username?: string;
    firstName?: string;
  }): { subscriber: Subscriber | null; isNew: boolean } {
    const existing = this.storage.getByTelegramId(data.telegramUserId);
    const subscriber = this.storage.createOrUpdate(data);

    if (subscriber && this.adminUserIds.includes(data.telegramUserId)) {
      this.storage.updateAdmin(data.telegramUserId, true);
      return { subscriber: this.storage.getByTelegramId(data.telegramUserId), isNew: !existing };
    }

    return { subscriber, isNew: !existing };
  }

  /**
   * Get subscriber by Telegram user ID
   */
  getByTelegramId(telegramUserId: number): Subscriber | null {
    return this.storage.getByTelegramId(telegramUserId);
  }

  /**
   * Get subscriber by ID
   */
  getById(id: number): Subscriber | null {
    return this.storage.getById(id);
  }

  /**
   * Subscribe a user
   */
  subscribe(telegramUserId: number): boolean {
    const subscriber = this.storage.getByTelegramId(telegramUserId);
    if (!subscriber) {
      logger.warn(`[Bot] Cannot subscribe unknown user: ${telegramUserId}`);
      return false;
    }

    return this.storage.updateSubscription(telegramUserId, true);
  }

  /**
   * Unsubscribe a user
   */
  unsubscribe(telegramUserId: number): boolean {
    const subscriber = this.storage.getByTelegramId(telegramUserId);
    if (!subscriber) {
      logger.warn(`[Bot] Cannot unsubscribe unknown user: ${telegramUserId}`);
      return false;
    }

    return this.storage.updateSubscription(telegramUserId, false);
  }

  /**
   * Check if user is subscribed
   */
  isSubscribed(telegramUserId: number): boolean {
    const subscriber = this.storage.getByTelegramId(telegramUserId);
    return subscriber?.isSubscribed ?? false;
  }

  /**
   * Check if user is admin
   */
  isAdmin(telegramUserId: number): boolean {
    // Check predefined admin list first
    if (this.adminUserIds.includes(telegramUserId)) {
      return true;
    }

    const subscriber = this.storage.getByTelegramId(telegramUserId);
    return subscriber?.isAdmin ?? false;
  }

  /**
   * Get all active subscribers
   */
  getActiveSubscribers(): Subscriber[] {
    return this.storage.getActiveSubscribers();
  }

  /**
   * Get all subscribers
   */
  getAllSubscribers(): Subscriber[] {
    return this.storage.getAllSubscribers();
  }

  /**
   * Record a report request (for rate limiting)
   */
  recordReportRequest(subscriberId: number): boolean {
    return this.storage.recordReportRequest(subscriberId);
  }

  /**
   * Get subscriber statistics
   */
  getStats(): {
    totalSubscribers: number;
    activeSubscribers: number;
    totalReports: number;
  } {
    return this.storage.getStats();
  }

  /**
   * Get user status summary
   */
  getUserStatus(telegramUserId: number): {
    exists: boolean;
    isSubscribed: boolean;
    isAdmin: boolean;
    reportCount: number;
    lastReportAt: string | null;
  } | null {
    const subscriber = this.storage.getByTelegramId(telegramUserId);
    if (!subscriber) {
      return null;
    }

    return {
      exists: true,
      isSubscribed: subscriber.isSubscribed,
      isAdmin: subscriber.isAdmin || this.adminUserIds.includes(telegramUserId),
      reportCount: subscriber.reportCount,
      lastReportAt: subscriber.lastReportSentAt,
    };
  }
}

export default SubscriberService;
