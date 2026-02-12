/**
 * /start Command Handler
 *
 * Welcome message and user registration.
 */

import type { Context } from "grammy";
import type { SubscriberService } from "../services/subscriber";
import { logger } from "../../utils/logger";

/**
 * Create /start command handler
 */
export function createStartHandler(subscriberService: SubscriberService) {
  return async (ctx: Context): Promise<void> => {
    const from = ctx.from;
    if (!from) {
      logger.warn("[Bot] /start called without user context");
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) {
      logger.warn("[Bot] /start called without chat context");
      return;
    }

    // Register user
    const { subscriber, isNew } = subscriberService.register({
      telegramUserId: from.id,
      chatId,
      username: from.username,
      firstName: from.first_name,
    });

    if (!subscriber) {
      await ctx.reply("Sorry, something went wrong. Please try again later.");
      return;
    }

    const name = from.first_name || from.username || "there";
    const adminTag = subscriber.isAdmin ? " (Admin)" : "";

    if (isNew) {
      logger.info(
        `[Bot] New user registered: ${from.id} (@${
          from.username || "no_username"
        })`,
      );

      await ctx.reply(
        `Welcome to TrendRadar, ${name}!${adminTag}\n\n` +
          `You are now subscribed to receive reports.\n\n` +
          `Commands:\n` +
          `/report - Get a report on-demand\n` +
          `/status - Check your subscription status\n` +
          `/unsubscribe - Stop receiving reports\n` +
          `/help - Show all commands`,
        { parse_mode: "HTML" },
      );
    } else {
      logger.info(
        `[Bot] Returning user: ${from.id} (@${from.username || "no_username"})`,
      );

      const statusMsg = subscriber.isSubscribed
        ? "You are currently subscribed to reports."
        : "You are currently unsubscribed. Use /subscribe to start receiving reports again.";

      await ctx.reply(
        `Welcome back, ${name}!${adminTag}\n\n` +
          `${statusMsg}\n\n` +
          `Use /help to see available commands.`,
        { parse_mode: "HTML" },
      );
    }
  };
}

export default createStartHandler;
