/**
 * /subscribe Command Handler
 *
 * Enable report notifications.
 */

import type { Context } from 'grammy';
import type { SubscriberService } from '../services/subscriber.js';
import { logger } from '../../utils/logger.js';

/**
 * Create /subscribe command handler
 */
export function createSubscribeHandler(subscriberService: SubscriberService) {
  return async (ctx: Context): Promise<void> => {
    const from = ctx.from;
    if (!from) {
      logger.warn('[Bot] /subscribe called without user context');
      return;
    }

    const subscriber = subscriberService.getByTelegramId(from.id);

    if (!subscriber) {
      // User not registered - redirect to /start
      await ctx.reply('You need to start the bot first. Please use /start to register.', {
        parse_mode: 'HTML',
      });
      return;
    }

    if (subscriber.isSubscribed) {
      await ctx.reply(
        'You are already subscribed to reports.\n\n' +
          'Use /report to get a report now, or /status to check your subscription.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const success = subscriberService.subscribe(from.id);

    if (success) {
      logger.info(`[Bot] User subscribed: ${from.id}`);
      await ctx.reply(
        'You are now subscribed to TrendRadar reports!\n\n' +
          'Use /report to get a report anytime.',
        { parse_mode: 'HTML' },
      );
    } else {
      await ctx.reply('Sorry, something went wrong. Please try again later.');
    }
  };
}

export default createSubscribeHandler;
