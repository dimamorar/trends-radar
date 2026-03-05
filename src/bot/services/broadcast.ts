/**
 * Broadcast Service
 *
 * Send reports to all active subscribers.
 */

import type { Bot } from "grammy";
import type { AppContext } from "../../core/context.js";
import { NewsAnalyzer } from "../../core/newsAnalyzer.js";
import { renderClusterReport } from "../../notification/renderer.js";
import { splitForPlatform } from "../../notification/splitter.js";
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
  reportErrorCode?: string;
  reportErrorMessage?: string;
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

    const messageResult = await this.generateReportMessages();
    if (!messageResult.ok) {
      result.reportErrorCode = messageResult.code;
      result.reportErrorMessage = messageResult.message;
      logger.warn(
        {
          code: messageResult.code,
          message: messageResult.message,
        },
        "[Broadcast] Report generation failed, skipping send",
      );
      return result;
    }

    const messages = messageResult.messages;

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
   * Generate analyzed cluster report messages once per broadcast run.
   */
  private async generateReportMessages(): Promise<
    | { ok: true; messages: string[] }
    | { ok: false; code: string; message: string }
  > {
    let analyzer: NewsAnalyzer | null = null;

    try {
      analyzer = new NewsAnalyzer(this.appContext.config);
      const reportResult = await analyzer.runOnDemandReport();

      if (!reportResult.ok) {
        return {
          ok: false,
          code: reportResult.code,
          message: reportResult.message,
        };
      }

      const htmlContent = renderClusterReport(reportResult.topics, {
        reportType: "TrendRadar Report",
        getTime: () => this.appContext.getTime(),
      });

      return {
        ok: true,
        messages: splitForPlatform(htmlContent, "telegram"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error }, "[Broadcast] Unexpected report generation error");
      return {
        ok: false,
        code: "pipeline_failed",
        message,
      };
    } finally {
      if (analyzer) {
        try {
          await analyzer.cleanup();
        } catch (error) {
          logger.warn({ error }, "[Broadcast] Analyzer cleanup failed");
        }
      }
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default BroadcastService;
