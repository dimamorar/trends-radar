import type { BotConfig, Config } from "../types/index.js";

/**
 * Get bot configuration with defaults.
 * Preference order for bot token:
 * - `bot.botToken`
 * - `notification.channels.telegram.botToken`
 */
export function getBotConfig(config: Config): BotConfig {
  const telegramToken =
    config.bot?.botToken ||
    config.notification.channels.telegram?.botToken ||
    "";

  return {
    enabled: config.bot?.enabled ?? true,
    botToken: telegramToken,
    adminUserIds: config.bot?.adminUserIds ?? [],
    rateLimit: {
      reportsPerHour: config.bot?.rateLimit?.reportsPerHour ?? 6,
      cooldownMinutes: config.bot?.rateLimit?.cooldownMinutes ?? 5,
    },
    databasePath: config.bot?.databasePath ?? "output/bot/bot.db",
    scheduleReportCron: config.bot?.scheduleReportCron,
    reportTimezone: config.bot?.reportTimezone,
  };
}
