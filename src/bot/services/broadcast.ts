/**
 * Broadcast Service
 *
 * Send reports to all active subscribers.
 */

import type { Bot } from "grammy";
import type { AppContext } from "../../core/context.js";
import { renderHtmlContent } from "../../notification/renderer.js";
import { splitForPlatform } from "../../notification/splitter.js";
import type { RssItem, StatisticsEntry } from "../../types/index.js";
import { logger, maskId } from "../../utils/logger.js";
import type { Subscriber } from "../storage/subscriber.js";
import type { SubscriberService } from "./subscriber.js";

/**
 * Broadcast result
 */
export interface BroadcastResult {
  totalSubscribers: number;
  successCount: number;
  failureCount: number;
  failures: Array<{
    subscriberId: number;
    chatId: number;
    error: string;
  }>;
}

/**
 * Broadcast Service class
 */
export class BroadcastService {
  private bot: Bot;
  private subscriberService: SubscriberService;
  private appContext: AppContext;

  constructor(
    bot: Bot,
    subscriberService: SubscriberService,
    appContext: AppContext,
  ) {
    this.bot = bot;
    this.subscriberService = subscriberService;
    this.appContext = appContext;
  }

  /**
   * Broadcast report to all active subscribers
   */
  async broadcastReport(): Promise<BroadcastResult> {
    const subscribers = this.subscriberService.getActiveSubscribers();

    const result: BroadcastResult = {
      totalSubscribers: subscribers.length,
      successCount: 0,
      failureCount: 0,
      failures: [],
    };

    if (subscribers.length === 0) {
      logger.info("[Broadcast] No active subscribers");
      return result;
    }

    logger.info(
      `[Broadcast] Starting broadcast to ${subscribers.length} subscribers`,
    );

    // Generate report
    const reportData = await this.generateReportData();

    if (!reportData.hasData) {
      logger.info("[Broadcast] No data available for broadcast");
      return result;
    }

    // Render HTML content
    const htmlContent = renderHtmlContent(
      { stats: reportData.stats },
      reportData.rssItems,
      {
        reportType: "TrendRadar Report",
        showRss: true,
        maxItems: this.appContext.config.report.maxNewsPerKeyword,
        getTime: () => this.appContext.getTime(),
      },
    );

    // Split for Telegram
    const messages = splitForPlatform(htmlContent, "telegram");

    // Send to each subscriber
    for (const subscriber of subscribers) {
      const success = await this.sendToSubscriber(subscriber, messages);

      if (success) {
        result.successCount++;
        this.subscriberService.recordReportRequest(subscriber.id);
      } else {
        result.failureCount++;
        result.failures.push({
          subscriberId: subscriber.id,
          chatId: subscriber.chatId,
          error: "Failed to send",
        });
      }

      // Rate limit: 30 messages per second (Telegram limit)
      await this.sleep(50);
    }

    logger.info(
      `[Broadcast] Completed: ${result.successCount}/${result.totalSubscribers} successful`,
    );

    return result;
  }

  /**
   * Send messages to a single subscriber
   */
  private async sendToSubscriber(
    subscriber: Subscriber,
    messages: string[],
  ): Promise<boolean> {
    try {
      for (let i = 0; i < messages.length; i++) {
        const batchHeader =
          messages.length > 1
            ? `<b>Report (${i + 1}/${messages.length})</b>\n\n`
            : "";

        await this.bot.api.sendMessage(
          subscriber.chatId,
          batchHeader + messages[i],
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          },
        );

        if (i < messages.length - 1) {
          await this.sleep(100);
        }
      }

      return true;
    } catch (error) {
      logger.error(
        { error, subscriberId: maskId(subscriber.id), chatId: maskId(subscriber.chatId) },
        "[Broadcast] Failed to send to subscriber",
      );
      return false;
    }
  }

  /**
   * Generate report data
   * Note: Frequency words logic has been removed - returns empty stats
   */
  private async generateReportData(): Promise<{
    hasData: boolean;
    stats: StatisticsEntry[];
    rssItems: RssItem[] | null;
  }> {
    const storage = this.appContext.getStorageManager();

    // Get RSS data
    const rssData = await storage.getRssData();
    let rssItems: RssItem[] | null = null;

    if (rssData) {
      rssItems = [];
      for (const [feedId, items] of Object.entries(rssData.items)) {
        const feedName = rssData.idToName[feedId] || feedId;
        for (const item of items) {
          rssItems.push({
            ...item,
            feedId,
            feedName,
          });
        }
      }
    }

    const hasData = rssItems !== null && rssItems.length > 0;

    return {
      hasData,
      stats: [],
      rssItems,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default BroadcastService;
