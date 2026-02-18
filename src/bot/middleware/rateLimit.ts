/**
 * Rate Limiter Middleware
 *
 * Limits report requests per user based on configured cooldown and hourly limits.
 */

import type { SubscriberStorage } from '../storage/subscriber.js';
import { logger, maskId } from '../../utils/logger.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  reportsPerHour: number;
  cooldownMinutes: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  waitMinutes?: number;
  requestsInLastHour?: number;
}

/**
 * Rate Limiter class
 */
export class RateLimiter {
  private storage: SubscriberStorage;
  private config: RateLimitConfig;

  constructor(storage: SubscriberStorage, config: RateLimitConfig) {
    this.storage = storage;
    this.config = config;
  }

  /**
   * Check if a report request is allowed
   */
  checkLimit(subscriberId: number): RateLimitResult {
    // Get recent requests within cooldown period
    const recentRequests = this.storage.getRecentReportRequests(
      subscriberId,
      this.config.cooldownMinutes,
    );

    // Check cooldown
    if (recentRequests.length > 0) {
      const lastRequest = recentRequests[0];
      const lastRequestTime = new Date(lastRequest.requestedAt);
      const now = new Date();
      const elapsedMinutes = (now.getTime() - lastRequestTime.getTime()) / (1000 * 60);
      const waitMinutes = Math.ceil(this.config.cooldownMinutes - elapsedMinutes);

      if (waitMinutes > 0) {
        logger.info(
          `[RateLimit] Subscriber ${maskId(subscriberId)} in cooldown, wait ${waitMinutes} minutes`,
        );
        return {
          allowed: false,
          reason: 'cooldown',
          waitMinutes,
        };
      }
    }

    // Check hourly limit
    const requestsInLastHour = this.storage.countReportRequestsInLastHour(subscriberId);

    if (requestsInLastHour >= this.config.reportsPerHour) {
      logger.info(
        `[RateLimit] Subscriber ${maskId(subscriberId)} exceeded hourly limit (${requestsInLastHour}/${this.config.reportsPerHour})`,
      );
      return {
        allowed: false,
        reason: 'hourly_limit',
        requestsInLastHour,
      };
    }

    return {
      allowed: true,
      requestsInLastHour,
    };
  }

  /**
   * Check rate limit with admin bypass
   */
  checkLimitWithBypass(subscriberId: number, isAdmin: boolean): RateLimitResult {
    if (isAdmin) {
      return { allowed: true };
    }

    return this.checkLimit(subscriberId);
  }

  /**
   * Get formatted rate limit message for user
   */
  static formatLimitMessage(result: RateLimitResult): string {
    if (result.allowed) {
      return '';
    }

    if (result.reason === 'cooldown' && result.waitMinutes) {
      const minutes = result.waitMinutes;
      if (minutes === 1) {
        return 'Please wait 1 minute before requesting another report.';
      }
      return `Please wait ${minutes} minutes before requesting another report.`;
    }

    if (result.reason === 'hourly_limit') {
      return 'You have reached the hourly report limit. Please try again later.';
    }

    return 'Rate limit exceeded. Please try again later.';
  }
}

export default RateLimiter;
