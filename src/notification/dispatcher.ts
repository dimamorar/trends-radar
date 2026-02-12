import type { Config, RssItem } from "../types/index.js";
import { logger } from "../utils/logger.js";
import {
  type ClusterReportTopic,
  type RenderOptions,
  type ReportData,
  renderClusterReport,
  renderHtmlContent,
  renderRssSummary,
} from "./renderer.js";
import { sendToTelegram } from "./senders/telegram.js";
import { addBatchHeaders, splitForPlatform } from "./splitter.js";

export interface DispatchResult {
  success: boolean;
  error?: string;
}

/**
 * Dispatch results for all channels
 */
export type DispatchResults = Record<string, DispatchResult>;

export interface DispatcherOptions {
  config: Config;
  getTime: () => Date;
}

export class NotificationDispatcher {
  private config: Config;
  private getTime: () => Date;

  constructor(options: DispatcherOptions) {
    this.config = options.config;
    this.getTime = options.getTime;
  }

  async dispatchAll(options: {
    reportData: ReportData;
    reportType: string;
    mode?: "daily" | "current" | "incremental";
    rssItems?: RssItem[] | null;
    rssNewItems?: RssItem[] | null;
    updateInfo?: { currentVersion?: string; remoteVersion?: string };
  }): Promise<DispatchResults> {
    const results: DispatchResults = {};
    const {
      reportData,
      reportType,
      mode = "daily",
      rssItems,
      updateInfo,
    } = options;

    const notification = this.config.notification;
    if (!notification.enabled) {
      logger.info("Notifications disabled");
      return results;
    }

    const displayRegions = this.config.display.regions;

    // Render content
    const renderOptions: RenderOptions = {
      reportType,
      mode,
      updateInfo,
      showRss: displayRegions.rss,
      showNewItems: displayRegions.newItems,
      getTime: this.getTime,
    };

    // Send to Telegram
    if (
      notification.channels.telegram?.botToken &&
      notification.channels.telegram?.chatId
    ) {
      results.telegram = await this.sendTelegram(
        reportData,
        rssItems || null,
        renderOptions,
      );
    }

    // TODO: Add other channels (Feishu, DingTalk, etc.)

    return results;
  }

  /**
   * Dispatch RSS-only notifications
   */
  async dispatchRss(options: {
    rssItems: RssItem[];
    feedsInfo?: Record<string, string>;
  }): Promise<DispatchResults> {
    const results: DispatchResults = {};
    const { rssItems } = options;

    if (!rssItems || rssItems.length === 0) {
      logger.info("No RSS items to dispatch");
      return results;
    }

    const notification = this.config.notification;
    if (!notification.enabled) {
      logger.info("Notifications disabled");
      return results;
    }

    // Send to Telegram
    if (
      notification.channels.telegram?.botToken &&
      notification.channels.telegram?.chatId
    ) {
      results.telegram = await this.sendRssTelegram(rssItems);
    }

    return results;
  }

  /**
   * Send to Telegram channel
   */
  private async sendTelegram(
    reportData: ReportData,
    rssItems: RssItem[] | null,
    renderOptions: RenderOptions,
  ): Promise<DispatchResult> {
    const telegram = this.config.notification.channels.telegram;
    if (!telegram?.botToken || !telegram?.chatId) {
      return { success: false, error: "Telegram not configured" };
    }

    try {
      // Render content
      const content = renderHtmlContent(reportData, rssItems, renderOptions);

      // Split into batches
      const batches = splitForPlatform(content, "telegram", 200);
      const messagesWithHeaders = addBatchHeaders(
        batches,
        renderOptions.reportType,
        batches.length > 1,
      );

      // Send
      const success = await sendToTelegram(
        {
          botToken: telegram.botToken,
          chatId: telegram.chatId,
          parseMode: "HTML",
        },
        messagesWithHeaders,
      );

      return { success };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error }, "Telegram send failed");
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Send RSS updates to Telegram
   */
  private async sendRssTelegram(rssItems: RssItem[]): Promise<DispatchResult> {
    const telegram = this.config.notification.channels.telegram;
    if (!telegram?.botToken || !telegram?.chatId) {
      return { success: false, error: "Telegram not configured" };
    }

    try {
      // Render RSS summary
      const content = renderRssSummary(rssItems, { getTime: this.getTime });

      // Split into batches
      const batches = splitForPlatform(content, "telegram", 200);
      const messagesWithHeaders = addBatchHeaders(
        batches,
        undefined,
        batches.length > 1,
      );

      // Send
      const success = await sendToTelegram(
        {
          botToken: telegram.botToken,
          chatId: telegram.chatId,
          parseMode: "HTML",
        },
        messagesWithHeaders,
      );

      return { success };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error }, "Telegram RSS send failed");
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Dispatch cluster-based topic report
   */
  async dispatchClusterReport(options: {
    topics: ClusterReportTopic[];
    reportType?: string;
  }): Promise<DispatchResults> {
    const results: DispatchResults = {};
    const { topics, reportType = "TrendRadar Daily Digest" } = options;

    const notification = this.config.notification;
    if (!notification.enabled) {
      logger.info("Notifications disabled");
      return results;
    }

    // Render cluster report
    const content = renderClusterReport(topics, {
      reportType,
      getTime: this.getTime,
    });

    // Send to Telegram
    if (
      notification.channels.telegram?.botToken &&
      notification.channels.telegram?.chatId
    ) {
      results.telegram = await this.sendClusterTelegram(content);
    }

    return results;
  }

  /**
   * Send cluster report to Telegram
   */
  private async sendClusterTelegram(content: string): Promise<DispatchResult> {
    const telegram = this.config.notification.channels.telegram;
    if (!telegram?.botToken || !telegram?.chatId) {
      return { success: false, error: "Telegram not configured" };
    }

    try {
      const batches = splitForPlatform(content, "telegram", 200);
      const messagesWithHeaders = addBatchHeaders(
        batches,
        undefined,
        batches.length > 1,
      );

      const success = await sendToTelegram(
        {
          botToken: telegram.botToken,
          chatId: telegram.chatId,
          parseMode: "HTML",
        },
        messagesWithHeaders,
      );

      return { success };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error }, "Telegram cluster report send failed");
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Check if any notification channel is configured
   */
  hasChannelConfigured(): boolean {
    const channels = this.config.notification.channels;
    return Boolean(
      (channels.telegram?.botToken && channels.telegram?.chatId) ||
      channels.email?.smtpHost ||
      channels.slack?.webhookUrl,
    );
  }
}

/**
 * Create notification dispatcher
 */
export function createNotificationDispatcher(
  config: Config,
  getTime: () => Date,
): NotificationDispatcher {
  return new NotificationDispatcher({ config, getTime });
}

export default NotificationDispatcher;
