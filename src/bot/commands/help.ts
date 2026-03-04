/**
 * /help Command Handler
 *
 * List available commands.
 */

import type { Context } from "grammy";
import type { SubscriberService } from "../services/subscriber";

/**
 * Create /help command handler
 */
export function createHelpHandler(subscriberService: SubscriberService) {
  return async (ctx: Context): Promise<void> => {
    const from = ctx.from;
    const isAdmin = from ? subscriberService.isAdmin(from.id) : false;

    let message =
      `<b>TrendRadar Bot Commands</b>\n\n` +
      `/start - Start the bot and register\n` +
      `/subscribe - Subscribe to automatic reports\n` +
      `/unsubscribe - Unsubscribe from automatic reports\n` +
      `/report - Get a report on-demand\n` +
      `/status - Check your subscription status\n` +
      `/help - Show this help message`;

    if (isAdmin) {
      message += `\n\n<b>Admin Commands</b>\n` + `/stats - Show bot statistics`;
    }

    await ctx.reply(message, { parse_mode: "HTML" });
  };
}

export default createHelpHandler;
