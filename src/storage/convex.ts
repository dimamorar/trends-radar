/**
 * Convex Client Wrapper
 *
 * Thin wrapper around ConvexHttpClient for use by the pipeline, bot, and MCP server.
 * Uses point-in-time queries (no subscriptions needed for batch pipeline).
 */

import { ConvexHttpClient } from 'convex/browser';
import { logger } from '../utils/logger';

export interface ConvexClientConfig {
  url: string;
  enabled: boolean;
}

let _client: ConvexHttpClient | null = null;

/**
 * Get or create a ConvexHttpClient singleton.
 */
export function getConvexClient(config: ConvexClientConfig): ConvexHttpClient | null {
  if (!config.enabled || !config.url) {
    logger.debug('[Convex] Disabled or no URL configured');
    return null;
  }

  if (!_client) {
    _client = new ConvexHttpClient(config.url);
    logger.info('[Convex] Client initialized');
  }

  return _client;
}

/**
 * Close the Convex client (for cleanup).
 */
export function closeConvexClient(): void {
  _client = null;
}
