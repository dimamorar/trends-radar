/**
 * /report Command Handler
 *
 * Generate and send report on-demand with rate limiting.
 */

import type { Context } from "grammy";
import type { AppContext } from "../../core/context";
import { renderHtmlContent } from "../../notification/renderer";
import { splitForPlatform } from "../../notification/splitter";
import type { RssItem, StatisticsEntry } from "../../types/index";
import { logger, maskId } from "../../utils/logger";
import { RateLimiter } from "../middleware/rateLimit";
import type { SubscriberService } from "../services/subscriber";

/**
 * Create /report command handler
 */
export function createReportHandler(
  subscriberService: SubscriberService,
  rateLimiter: RateLimiter,
  appContext: AppContext,
) {
  return async (ctx: Context): Promise<void> => {
    const from = ctx.from;
    const chatId = ctx.chat?.id;
    if (!from || !chatId) {
      logger.warn("[Bot] /report called without user or chat context");
      return;
    }

    const subscriber = subscriberService.getByTelegramId(from.id);

    if (!subscriber) {
      await ctx.reply(
        "You need to start the bot first. Please use /start to register.",
        {
          parse_mode: "HTML",
        },
      );
      return;
    }

    // Check rate limit
    const isAdmin = subscriberService.isAdmin(from.id);
    const rateLimitResult = rateLimiter.checkLimitWithBypass(
      subscriber.id,
      isAdmin,
    );

    if (!rateLimitResult.allowed) {
      const message = RateLimiter.formatLimitMessage(rateLimitResult);
      await ctx.reply(message, { parse_mode: "HTML" });
      return;
    }

    // Send "generating report" message
    const loadingMsg = await ctx.reply("Generating report...");

    try {
      // Generate report data
      const reportData = await generateReportData(appContext);

      if (!reportData.hasData) {
        await ctx.api.editMessageText(
          chatId,
          loadingMsg.message_id,
          "No data available for report. Please try again later.",
        );
        return;
      }

      // Render HTML content
      const htmlContent = renderHtmlContent(
        { stats: reportData.stats },
        reportData.rssItems,
        {
          reportType: "TrendRadar Report",
          showRss: true,
          maxItems: appContext.config.report.maxNewsPerKeyword,
          getTime: () => appContext.getTime(),
        },
      );

      // Split for Telegram
      const messages = splitForPlatform(htmlContent, "telegram");

      // Delete loading message
      await ctx.api.deleteMessage(chatId, loadingMsg.message_id);

      // Send report messages
      for (let i = 0; i < messages.length; i++) {
        const batchHeader =
          messages.length > 1
            ? `<b>Report (${i + 1}/${messages.length})</b>\n\n`
            : "";

        await ctx.reply(batchHeader + messages[i], {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });

        // Small delay between messages
        if (i < messages.length - 1) {
          await sleep(500);
        }
      }

      // Record the request
      subscriberService.recordReportRequest(subscriber.id);
      logger.info(`[Bot] Report sent to user ${maskId(from.id)}`);
    } catch (error) {
      logger.error({ error }, "[Bot] Failed to generate/send report");

      try {
        await ctx.api.editMessageText(
          chatId,
          loadingMsg.message_id,
          "Sorry, failed to generate the report. Please try again later.",
        );
      } catch {
        await ctx.reply(
          "Sorry, failed to generate the report. Please try again later.",
        );
      }
    }
  };
}

/**
 * Generate report data from AppContext
 * Note: Frequency words logic has been removed - returns empty stats
 */
async function generateReportData(appContext: AppContext): Promise<{
  hasData: boolean;
  stats: StatisticsEntry[];
  rssItems: RssItem[] | null;
}> {
  const storage = appContext.getStorageManager();

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
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default createReportHandler;
