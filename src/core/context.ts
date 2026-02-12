/**
 * Application Context
 *
 * Encapsulates all configuration-dependent operations, eliminating global state.
 * Provides unified interfaces for storage, time operations, and analysis.
 */

import {
  getStorageManager,
  type StorageManager,
  type StorageManagerOptions,
} from "../storage/manager";
import { getConvexClient, closeConvexClient } from "../storage/convex";
import type { ConvexHttpClient } from "convex/browser";
import type { Config } from "../types/index";
import {
  convertTimeForDisplay,
  formatDateFolder,
  formatTimeFilename,
  getConfiguredTime,
  getCurrentTimeDisplay,
} from "../utils/time";
import { logger } from "../utils/logger";

/**
 * Application Context class
 *
 * Encapsulates all configuration-dependent operations, provides a unified interface.
 * Eliminates reliance on global CONFIG, improves testability.
 */
export class AppContext {
  private _config: Config;
  private _storageManager: StorageManager | null = null;
  private _convexClient: ConvexHttpClient | null = null;

  constructor(config: Config) {
    this._config = config;
  }

  // === Configuration Access ===

  get config(): Config {
    return this._config;
  }

  get timezone(): string {
    return this._config.app.timezone;
  }

  get rankThreshold(): number {
    return this._config.rankThreshold ?? 50;
  }

  get rssConfig() {
    return this._config.rss;
  }

  get rssFeeds() {
    return this._config.rss.feeds ?? [];
  }

  get displayMode(): "keyword" | "platform" {
    return this._config.report.displayMode;
  }

  get reportMode(): "daily" | "current" | "incremental" {
    return this._config.report.mode;
  }

  get showNewSection(): boolean {
    return this._config.display.regions.newItems;
  }

  get regionOrder(): string[] {
    return (
      this._config.display.regionOrder ?? [
        "hotlist",
        "rss",
        "new_items",
        "standalone",
        "ai_analysis",
      ]
    );
  }

  // === Time Operations ===

  getTime(): Date {
    return getConfiguredTime(this.timezone);
  }

  formatDate(): string {
    return formatDateFolder(this.timezone);
  }

  formatTime(): string {
    return formatTimeFilename(this.timezone);
  }

  getTimeDisplay(): string {
    return getCurrentTimeDisplay(this.timezone);
  }

  static convertTimeDisplay(timeStr: string): string {
    return convertTimeForDisplay(timeStr);
  }

  // === Storage Operations ===

  getStorageManager(): StorageManager {
    if (this._storageManager === null) {
      const storageConfig = this._config.storage;

      const options: StorageManagerOptions = {
        backendType: storageConfig.backend,
        dataDir: storageConfig.local.dataDir,
        enableTxt: storageConfig.formats.txt,
        enableHtml: storageConfig.formats.html,
        localRetentionDays: storageConfig.local.retentionDays,
        timezone: this.timezone,
      };

      // TODO: Implement remote storage configuration
      if (storageConfig.remote) {
        options.remoteConfig = {
          bucketName: storageConfig.remote.bucketName,
          accessKeyId: storageConfig.remote.accessKeyId,
          secretAccessKey: storageConfig.remote.secretAccessKey,
          endpointUrl: storageConfig.remote.endpointUrl,
          region: storageConfig.remote.region,
        };
        options.remoteRetentionDays = storageConfig.remote.retentionDays;
      }

      // TODO: Implement pull configuration. but first decide is it necessary
      if (storageConfig.pull) {
        options.pullEnabled = storageConfig.pull.enabled;
        options.pullDays = storageConfig.pull.days;
      }

      this._storageManager = getStorageManager(options);
    }

    return this._storageManager;
  }

  getConvexClient(): ConvexHttpClient | null {
    if (this._convexClient) return this._convexClient;

    const convexConfig = this._config.convex;
    if (!convexConfig?.enabled || !convexConfig.url) {
      return null;
    }

    this._convexClient = getConvexClient({
      url: convexConfig.url,
      enabled: convexConfig.enabled,
    });

    logger.info(`[Convex] Client initialized`);

    return this._convexClient;
  }

  get convexEnabled(): boolean {
    return !!(this._config.convex?.enabled && this._config.convex?.url);
  }

  // === Resource Cleanup ===

  async cleanup(): Promise<void> {
    if (this._storageManager) {
      await this._storageManager.cleanupOldData();
      await this._storageManager.cleanup();
      this._storageManager = null;
    }

    // Cleanup old Convex data based on retention days
    if (this._convexClient && this.convexEnabled) {
      try {
        const { anyApi } = await import("convex/server");
        const retentionDays = this._config.storage.local.retentionDays;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);
        const cutoffDate = cutoff.toISOString().split("T")[0];

        const deleted = await this._convexClient.mutation(
          anyApi.cleanup.cleanupOldData,
          { cutoffDate },
        );
        if (deleted > 0) {
          const { logger } = await import("../utils/logger");
          logger.info(
            `[Convex] Cleaned up ${deleted} old records (before ${cutoffDate})`,
          );
        }
      } catch (_) {
        // Best effort -- don't fail the pipeline over cleanup
      }
      closeConvexClient();
      this._convexClient = null;
    }
  }
}

export default AppContext;
