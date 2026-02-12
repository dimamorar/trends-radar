/**
 * /unsubscribe Command Handler
 *
 * Disable report notifications.
 */

import type { Context } from 'grammy';
import type { SubscriberService } from '../services/subscriber.js';
import { logger } from '../../utils/logger.js';

/**
 * Create /unsubscribe command handler
 */
export function createUnsubscribeHandler(subscriberService: SubscriberService) {
  return async (ctx: Context): Promise<void> => {
    const from = ctx.from;
    if (!from) {
      logger.warn('[Bot] /unsubscribe called without user context');
      return;
    }

    const subscriber = subscriberService.getByTelegramId(from.id);

    if (!subscriber) {
      await ctx.reply('You need to start the bot first. Please use /start to register.', {
        parse_mode: 'HTML',
      });
      return;
    }

    if (!subscriber.isSubscribed) {
      await ctx.reply(
        'You are already unsubscribed from reports.\n\n' +
          'Use /subscribe to start receiving reports again.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const success = subscriberService.unsubscribe(from.id);

    if (success) {
      logger.info(`[Bot] User unsubscribed: ${from.id}`);
      await ctx.reply(
        'You have been unsubscribed from TrendRadar reports.\n\n' +
          'You can still use /report to get reports on-demand.\n' +
          'Use /subscribe to start receiving automatic reports again.',
        { parse_mode: 'HTML' },
      );
    } else {
      await ctx.reply('Sorry, something went wrong. Please try again later.');
    }
  };
}

export default createUnsubscribeHandler;
