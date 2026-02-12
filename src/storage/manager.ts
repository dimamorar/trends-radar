/**
 * Storage Manager - Unified storage backend management
 *
 * Automatically selects appropriate storage backend based on environment and configuration.
 */

import { existsSync } from "node:fs";
import type { RssItem } from "../types/index.js";
import logger from "../utils/logger.js";
import type { RssData, StorageBackend, StorageNewsData } from "./base.js";
import { LocalStorageBackend } from "./local.js";
import { RemoteStorageBackend } from "./remote.js";

/**
 * Remote storage configuration
 */
export interface RemoteStorageConfig {
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpointUrl: string;
  region?: string;
}

/**
 * Storage manager options
 */
export interface StorageManagerOptions {
  backendType?: "local" | "remote" | "auto";
  dataDir?: string;
  enableTxt?: boolean;
  enableHtml?: boolean;
  remoteConfig?: RemoteStorageConfig;
  localRetentionDays?: number;
  remoteRetentionDays?: number;
  pullEnabled?: boolean;
  pullDays?: number;
  timezone?: string;
}

/**
 * Storage Manager
 *
 * Features:
 * - Auto-detect runtime environment (GitHub Actions / Docker / local)
 * - Select storage backend based on configuration (local / remote / auto)
 * - Provide unified storage interface
 * - Support pulling data from remote to local
 */
export class StorageManager {
  private backendType: "local" | "remote" | "auto";
  private dataDir: string;
  private enableTxt: boolean;
  private enableHtml: boolean;
  private remoteConfig: RemoteStorageConfig | null;
  private localRetentionDays: number;
  private remoteRetentionDays: number;
  private pullEnabled: boolean;
  private pullDays: number;
  private timezone: string;

  private _backend: StorageBackend | null = null;
  private _remoteBackend: StorageBackend | null = null;

  constructor(options: StorageManagerOptions = {}) {
    this.backendType = options.backendType || "auto";
    this.dataDir = options.dataDir || "output";
    this.enableTxt = options.enableTxt ?? false;
    this.enableHtml = options.enableHtml ?? true;
    this.remoteConfig = options.remoteConfig || null;
    this.localRetentionDays = options.localRetentionDays ?? 0;
    this.remoteRetentionDays = options.remoteRetentionDays ?? 0;
    this.pullEnabled = options.pullEnabled ?? false;
    this.pullDays = options.pullDays ?? 0;
    this.timezone = options.timezone || "Europe/Kyiv";
  }

  /**
   * Check if running in GitHub Actions
   */
  static isGitHubActions(): boolean {
    return process.env.GITHUB_ACTIONS === "true";
  }

  /**
   * Check if running in Docker
   */
  static isDocker(): boolean {
    // Method 1: Check /.dockerenv file
    if (existsSync("/.dockerenv")) {
      return true;
    }

    // Method 2: Check environment variable
    return process.env.DOCKER_CONTAINER === "true";
  }

  /**
   * Resolve actual backend type
   */
  private resolveBackendType(): "local" | "remote" {
    if (this.backendType === "auto") {
      if (StorageManager.isGitHubActions()) {
        if (this.hasRemoteConfig()) {
          return "remote";
        } else {
          logger.info(
            "GitHub Actions environment but no remote storage configured, using local"
          );
          return "local";
        }
      }
      return "local";
    }
    return this.backendType as "local" | "remote";
  }

  /**
   * Check if remote config is valid
   */
  private hasRemoteConfig(): boolean {
    // Check config or environment variables
    const bucketName =
      this.remoteConfig?.bucketName || process.env.S3_BUCKET_NAME;
    const accessKey =
      this.remoteConfig?.accessKeyId || process.env.S3_ACCESS_KEY_ID;
    const secretKey =
      this.remoteConfig?.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY;
    const endpoint =
      this.remoteConfig?.endpointUrl || process.env.S3_ENDPOINT_URL;

    const hasConfig = Boolean(bucketName && accessKey && secretKey && endpoint);

    return hasConfig;
  }

  /**
   * Create remote storage backend
   */
  private createRemoteBackend(): StorageBackend | null {
    try {
      return new RemoteStorageBackend({
        bucketName:
          this.remoteConfig?.bucketName || process.env.S3_BUCKET_NAME || "",
        accessKeyId:
          this.remoteConfig?.accessKeyId || process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey:
          this.remoteConfig?.secretAccessKey ||
          process.env.S3_SECRET_ACCESS_KEY ||
          "",
        endpointUrl:
          this.remoteConfig?.endpointUrl || process.env.S3_ENDPOINT_URL || "",
        region: this.remoteConfig?.region || process.env.S3_REGION || "auto",
        enableTxt: this.enableTxt,
        enableHtml: this.enableHtml,
        timezone: this.timezone,
      });
    } catch (error) {
      logger.error({ error }, "Failed to create remote backend");
      return null;
    }
  }

  /**
   * Get storage backend instance
   */
  getBackend(): StorageBackend {
    if (this._backend === null) {
      const resolvedType = this.resolveBackendType();

      if (resolvedType === "remote") {
        this._backend = this.createRemoteBackend();
        if (this._backend) {
          logger.info("Using remote storage backend");
        } else {
          logger.warn("Falling back to local storage");
        }
      }

      if (resolvedType === "local" || this._backend === null) {
        this._backend = new LocalStorageBackend({
          dataDir: this.dataDir,
          enableTxt: this.enableTxt,
          enableHtml: this.enableHtml,
          timezone: this.timezone,
        });
        logger.info(`Using local storage backend (data dir: ${this.dataDir})`);
      }
    }

    return this._backend;
  }

  /**
   * Pull data from remote to local
   */
  async pullFromRemote(): Promise<number> {
    if (!this.pullEnabled || this.pullDays <= 0) {
      return 0;
    }

    if (!this.hasRemoteConfig()) {
      logger.warn("No remote storage configured, cannot pull");
      return 0;
    }

    if (this._remoteBackend === null) {
      this._remoteBackend = this.createRemoteBackend();
    }

    if (this._remoteBackend === null) {
      logger.error("Cannot create remote backend, pull failed");
      return 0;
    }

    // Call pull method if available
    if ("pullRecentDays" in this._remoteBackend) {
      return (this._remoteBackend as RemoteStorageBackend).pullRecentDays(
        this.pullDays,
        this.dataDir
      );
    }

    return 0;
  }

  async saveNewsData(data: StorageNewsData): Promise<boolean> {
    return this.getBackend().saveNewsData(data);
  }

  async saveRssData(data: RssData): Promise<boolean> {
    return this.getBackend().saveRssData(data);
  }

  async getRssData(date?: string): Promise<RssData | null> {
    return this.getBackend().getRssData(date);
  }

  async getLatestRssData(date?: string): Promise<RssData | null> {
    return this.getBackend().getLatestRssData(date);
  }

  async detectNewRssItems(
    currentData: RssData
  ): Promise<Record<string, RssItem[]>> {
    return this.getBackend().detectNewRssItems(currentData);
  }

  async getTodayAllData(date?: string): Promise<StorageNewsData | null> {
    return this.getBackend().getTodayAllData(date);
  }

  async getLatestCrawlData(date?: string): Promise<StorageNewsData | null> {
    return this.getBackend().getLatestCrawlData(date);
  }

  async detectNewTitles(
    currentData: StorageNewsData
  ): Promise<Record<string, Record<string, unknown>>> {
    return this.getBackend().detectNewTitles(currentData);
  }

  async saveTxtSnapshot(data: StorageNewsData): Promise<string | null> {
    return this.getBackend().saveTxtSnapshot(data);
  }

  async saveHtmlReport(
    htmlContent: string,
    filename: string,
    isSummary = false
  ): Promise<string | null> {
    return this.getBackend().saveHtmlReport(htmlContent, filename, isSummary);
  }

  async isFirstCrawlToday(date?: string): Promise<boolean> {
    return this.getBackend().isFirstCrawlToday(date);
  }

  async hasPushedToday(date?: string): Promise<boolean> {
    return this.getBackend().hasPushedToday(date);
  }

  async recordPush(reportType: string, date?: string): Promise<boolean> {
    return this.getBackend().recordPush(reportType, date);
  }

  async cleanup(): Promise<void> {
    if (this._backend) {
      await this._backend.cleanup();
    }
    if (this._remoteBackend) {
      await this._remoteBackend.cleanup();
    }
  }

  async cleanupOldData(): Promise<number> {
    let totalDeleted = 0;

    // Cleanup local data
    if (this.localRetentionDays > 0) {
      totalDeleted += await this.getBackend().cleanupOldData(
        this.localRetentionDays
      );
    }

    // Cleanup remote data
    if (this.remoteRetentionDays > 0 && this.hasRemoteConfig()) {
      if (this._remoteBackend === null) {
        this._remoteBackend = this.createRemoteBackend();
      }
      if (this._remoteBackend) {
        totalDeleted += await this._remoteBackend.cleanupOldData(
          this.remoteRetentionDays
        );
      }
    }

    return totalDeleted;
  }

  get backendName(): string {
    return this.getBackend().backendName;
  }

  get supportsTxt(): boolean {
    return this.getBackend().supportsTxt;
  }
}

// Singleton instance
let _storageManager: StorageManager | null = null;

/**
 * Get storage manager singleton
 */
export function getStorageManager(
  options: StorageManagerOptions = {},
  forceNew = false
): StorageManager {
  if (_storageManager === null || forceNew) {
    _storageManager = new StorageManager(options);
  }
  return _storageManager;
}

export default StorageManager;
