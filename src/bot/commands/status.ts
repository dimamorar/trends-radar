/**
 * /status Command Handler
 *
 * Show subscription status and stats.
 */

import type { Context } from 'grammy';
import type { SubscriberService } from '../services/subscriber.js';
import { logger } from '../../utils/logger.js';

/**
 * Create /status command handler
 */
export function createStatusHandler(subscriberService: SubscriberService) {
  return async (ctx: Context): Promise<void> => {
    const from = ctx.from;
    if (!from) {
      logger.warn('[Bot] /status called without user context');
      return;
    }

    const status = subscriberService.getUserStatus(from.id);

    if (!status) {
      await ctx.reply('You need to start the bot first. Please use /start to register.', {
        parse_mode: 'HTML',
      });
      return;
    }

    const subscriptionStatus = status.isSubscribed ? 'Subscribed' : 'Unsubscribed';

    const adminBadge = status.isAdmin ? ' [Admin]' : '';

    let lastReportText = 'Never';
    if (status.lastReportAt) {
      const lastReportDate = new Date(status.lastReportAt);
      lastReportText = lastReportDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }

    const message =
      `<b>Your Status</b>${adminBadge}\n\n` +
      `Subscription: <b>${subscriptionStatus}</b>\n` +
      `Reports received: <b>${status.reportCount}</b>\n` +
      `Last report: <b>${lastReportText}</b>\n\n` +
      (status.isSubscribed
        ? 'Use /unsubscribe to stop receiving automatic reports.'
        : 'Use /subscribe to start receiving automatic reports.');

    await ctx.reply(message, { parse_mode: 'HTML' });
  };
}

export default createStatusHandler;
