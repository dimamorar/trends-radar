/**
 * Configuration types
 */

import type { RssFeedConfig } from "./index.js";

/**
 * Storage configuration
 */
export interface StorageConfig {
  backend: "local" | "remote" | "auto";
  formats: {
    sqlite: boolean;
    txt: boolean;
    html: boolean;
  };
  local: {
    dataDir: string;
    retentionDays: number;
  };
  remote?: {
    bucketName: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpointUrl: string;
    region: string;
    retentionDays?: number;
  };
  pull?: {
    enabled: boolean;
    days: number;
  };
}

/**
 * AI Pipeline configuration for classification, embedding, clustering, and summarization
 */
export interface AIPipelineConfig {
  enabled: boolean;
  classification?: {
    model: string; // e.g., "openai/gpt-4o-mini"
    batchSize: number;
    concurrency: number;
  };
  embedding: {
    model: string; // e.g., "openai/text-embedding-3-small"
    cacheEnabled: boolean;
  };
  clustering: {
    similarityThreshold: number; // e.g., 0.82
  };
  summarization: {
    model: string; // e.g., "openai/gpt-4o-mini"
    minImportance: number; // Minimum importance score to summarize
    maxTopics: number; // Maximum number of topics in report
  };
  scoring: {
    minSources: number; // Minimum distinct sources to keep cluster
    minMentions: number; // Minimum mentions when single source
    sourceExponent: number; // Exponent for source diversity weight
  };
}

/**
 * AI configuration
 */
export interface AIConfig {
  model: string;
  apiKey: string;
  apiBase?: string;
  timeout: number;
  fallbackModels?: string[]; // Fallback models for retry on failure
}

/**
 * AI analysis configuration
 */
export interface AIAnalysisConfig {
  enabled: boolean;
  language: string;
  promptFile?: string;
  maxNews?: number; // Maximum news items to analyze
  useStructuredOutput?: boolean; // Use AI SDK structured output feature
}

/**
 * Notification channel base config
 */
export interface NotificationChannelConfig {
  enabled?: boolean;
}

/**
 * Telegram notification config
 */
export interface TelegramNotificationConfig extends NotificationChannelConfig {
  botToken: string;
  chatId: string;
}

/**
 * Webhook notification config (Feishu, DingTalk, WeChat Work, Slack)
 */
export interface WebhookNotificationConfig extends NotificationChannelConfig {
  webhookUrl: string;
  secret?: string;
}

/**
 * Email notification config
 */
export interface EmailNotificationConfig extends NotificationChannelConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  from: string;
  to: string;
}

/**
 * Bark notification config
 */
export interface BarkNotificationConfig extends NotificationChannelConfig {
  serverUrl: string;
  deviceKey: string;
}

/**
 * Ntfy notification config
 */
export interface NtfyNotificationConfig extends NotificationChannelConfig {
  serverUrl: string;
  topic: string;
  token?: string;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
  enabled: boolean;
  channels: {
    telegram?: TelegramNotificationConfig;
    feishu?: WebhookNotificationConfig;
    dingtalk?: WebhookNotificationConfig;
    wework?: WebhookNotificationConfig;
    email?: EmailNotificationConfig;
    slack?: WebhookNotificationConfig;
    bark?: BarkNotificationConfig;
    ntfy?: NtfyNotificationConfig;
  };
}

/**
 * Report configuration
 */
export interface ReportConfig {
  mode: "daily" | "current" | "incremental";
  displayMode: "keyword" | "platform";
  maxNewsPerKeyword: number;
}

/**
 * Runtime overrides (formerly CLI flags)
 */
export interface RuntimeConfig {
  verbose: boolean;
  dryRun: boolean;
  outputDir?: string;
  ai: "on" | "off" | "config";
  mode: "daily" | "current" | "incremental" | "config";
  dedupThreshold?: number;
  inspect?: boolean;
}

/**
 * Display configuration
 */
export interface DisplayConfig {
  regions: {
    hotlist: boolean;
    rss: boolean;
    newItems: boolean;
    aiAnalysis: boolean;
  };
  regionOrder?: string[];
}

/**
 * Telegram channel configuration
 */
export interface TelegramChannelConfig {
  username: string;
  tier?: number;
  category?: string;
}

/**
 * Telegram channels scraping config
 */
export interface TelegramChannelsConfig {
  enabled: boolean;
  apiId: string;
  apiHash: string;
  sessionString?: string;
  scrapeHours: number;
  limitPerChannel: number;
  channels: TelegramChannelConfig[];
}

/**
 * RSS configuration
 */
export interface RssConfig {
  freshnessFilter?: {
    enabled: boolean;
    maxAgeDays: number;
  };
  feeds: RssFeedConfig[];
}

/**
 * App configuration
 */
export interface AppConfig {
  timezone: string;
  showVersionUpdate?: boolean;
  entrypoint?: "run" | "bot" | "both";
}

/**
 * Bot rate limit configuration
 */
export interface BotRateLimitConfig {
  reportsPerHour: number;
  cooldownMinutes: number;
}

/**
 * Bot configuration
 */
export interface BotConfig {
  enabled: boolean;
  botToken: string;
  adminUserIds: number[];
  rateLimit: BotRateLimitConfig;
  databasePath: string;
  scheduleReportCron?: string;
  reportTimezone?: string;
}

/**
 * Convex database configuration
 */
export interface ConvexConfig {
  enabled: boolean;
  url: string;
}

/**
 * Main configuration object
 */
export interface Config {
  app: AppConfig;
  rss: RssConfig;
  report: ReportConfig;
  notification: NotificationConfig;
  storage: StorageConfig;
  ai: AIConfig;
  aiAnalysis: AIAnalysisConfig;
  display: DisplayConfig;
  runtime?: RuntimeConfig;
  telegramChannels?: TelegramChannelsConfig;
  bot?: BotConfig;
  aiPipeline?: AIPipelineConfig;
  convex?: ConvexConfig;
  // Weight configuration for scoring
  weightConfig?: {
    rank: number;
    frequency: number;
    hotness: number;
  };
  rankThreshold?: number;
}
