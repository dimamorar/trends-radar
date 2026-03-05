import cron from "node-cron";
import { Bot } from "grammy";
import type { AppContext } from "../core/context.js";
import type { BotConfig } from "../types/config.js";
import { logger } from "../utils/logger.js";
import {
  createHelpHandler,
  createReportHandler,
  createStartHandler,
  createStatsHandler,
  createStatusHandler,
  createSubscribeHandler,
  createUnsubscribeHandler,
} from "./commands/index.js";
import { RateLimiter } from "./middleware/rateLimit.js";
import { BroadcastService } from "./services/broadcast.js";
import { SubscriberService } from "./services/subscriber.js";
import { SubscriberStorage } from "./storage/subscriber.js";

/**
 * TrendRadar Bot class
 */
export class TrendRadarBot {
  private bot: Bot;
  private storage: SubscriberStorage;
  private subscriberService: SubscriberService;
  private rateLimiter: RateLimiter;
  private broadcastService: BroadcastService;
  private appContext: AppContext;
  private botConfig: BotConfig;
  private isRunning = false;
  private scheduledTask: cron.ScheduledTask | null = null;

  constructor(appContext: AppContext, botConfig: BotConfig) {
    this.appContext = appContext;
    this.botConfig = botConfig;

    // Validate bot token
    if (!botConfig.botToken) {
      throw new Error("Bot token is required");
    }

    // Initialize bot
    this.bot = new Bot(botConfig.botToken);

    // Initialize storage
    this.storage = new SubscriberStorage(botConfig.databasePath);
    this.storage.initialize();

    // Initialize services
    this.subscriberService = new SubscriberService(
      this.storage,
      botConfig.adminUserIds,
    );

    this.rateLimiter = new RateLimiter(this.storage, {
      reportsPerHour: botConfig.rateLimit.reportsPerHour,
      cooldownMinutes: botConfig.rateLimit.cooldownMinutes,
    });

    this.broadcastService = new BroadcastService(
      this.bot,
      this.subscriberService,
      this.appContext,
    );

    // Setup commands
    this.setupCommands();

    // Setup error handling
    this.setupErrorHandling();

    logger.info("[Bot] TrendRadar bot initialized");
  }

  /**
   * Setup command handlers
   */
  private setupCommands(): void {
    // Basic commands
    this.bot.command("start", createStartHandler(this.subscriberService));
    this.bot.command(
      "subscribe",
      createSubscribeHandler(this.subscriberService),
    );
    this.bot.command(
      "unsubscribe",
      createUnsubscribeHandler(this.subscriberService),
    );
    this.bot.command("status", createStatusHandler(this.subscriberService));
    this.bot.command("help", createHelpHandler(this.subscriberService));

    // Report command with rate limiting
    this.bot.command(
      "report",
      createReportHandler(
        this.subscriberService,
        this.rateLimiter,
        this.appContext,
      ),
    );

    // Admin commands
    this.bot.command("stats", createStatsHandler(this.subscriberService));

    // Set bot commands for menu
    this.bot.api.setMyCommands([
      { command: "start", description: "Start the bot" },
      { command: "subscribe", description: "Subscribe to reports" },
      { command: "unsubscribe", description: "Unsubscribe from reports" },
      { command: "report", description: "Get a report now" },
      { command: "status", description: "Check subscription status" },
      { command: "help", description: "Show help" },
    ]);
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.bot.catch((err) => {
      const ctx = err.ctx;
      logger.error(
        {
          error: err.error,
          update_id: ctx.update.update_id,
        },
        "[Bot] Error handling update",
      );
    });
  }

  /**
   * Start the bot (long-polling mode)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("[Bot] Bot is already running");
      return;
    }

    logger.info("[Bot] Starting bot in long-polling mode...");

    this.setupScheduledBroadcast();
    this.setupGracefulShutdown();

    this.isRunning = true;

    try {
      await this.bot.start({
        onStart: (botInfo) => {
          logger.info(`[Bot] Bot started as @${botInfo.username}`);
        },
      });
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Schedule report broadcast to active subscribers if scheduleReportCron is set.
   */
  private setupScheduledBroadcast(): void {
    const { scheduleReportCron, reportTimezone } = this.botConfig;
    if (!scheduleReportCron) {
      return;
    }

    this.scheduledTask = cron.schedule(
      scheduleReportCron,
      async () => {
        logger.info("[Bot] Running scheduled broadcast");
        try {
          const result = await this.broadcastService.broadcastReport();
          logger.info({ ...result }, "[Bot] Scheduled broadcast finished");
        } catch (error) {
          logger.error({ error }, "[Bot] Scheduled broadcast failed");
        }
      },
      reportTimezone ? { timezone: reportTimezone } : undefined,
    );

    logger.info(
      { scheduleReportCron, reportTimezone },
      "[Bot] Scheduled broadcast enabled",
    );
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info("[Bot] Stopping bot...");

    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
    }

    this.bot.stop();
    this.storage.cleanup();
    this.isRunning = false;

    logger.info("[Bot] Bot stopped");
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`[Bot] Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }

  /**
   * Get subscriber service for external use
   */
  getSubscriberService(): SubscriberService {
    return this.subscriberService;
  }
}

export default TrendRadarBot;
