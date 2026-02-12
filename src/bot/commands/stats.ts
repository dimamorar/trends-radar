/**
 * /stats Command Handler (Admin only)
 *
 * Show bot statistics.
 */

import type { Context } from "grammy";
import type { SubscriberService } from "../services/subscriber";
import { logger } from "../../utils/logger";

/**
 * Create /stats command handler
 */
export function createStatsHandler(subscriberService: SubscriberService) {
  return async (ctx: Context): Promise<void> => {
    const from = ctx.from;
    if (!from) {
      logger.warn("[Bot] /stats called without user context");
      return;
    }

    // Check admin permission
    if (!subscriberService.isAdmin(from.id)) {
      await ctx.reply("This command is only available to administrators.");
      return;
    }

    const stats = subscriberService.getStats();

    const message =
      `<b>Bot Statistics</b>\n\n` +
      `Total subscribers: <b>${stats.totalSubscribers}</b>\n` +
      `Active subscribers: <b>${stats.activeSubscribers}</b>\n` +
      `Inactive subscribers: <b>${
        stats.totalSubscribers - stats.activeSubscribers
      }</b>\n` +
      `Total reports sent: <b>${stats.totalReports}</b>`;

    await ctx.reply(message, { parse_mode: "HTML" });
  };
}

export default createStatsHandler;
