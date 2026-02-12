import { TrendRadarBot, getBotConfig } from "./bot/index";
import { AppContext } from "./core/context";
import { applyRuntimeOverrides, loadConfig } from "./core/config";
import { NewsAnalyzer } from "./core/newsAnalyzer";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  const rawConfig = loadConfig();
  const config = applyRuntimeOverrides(rawConfig);

  if (config.runtime?.verbose) {
    logger.level = "debug";
  }

  const entrypoint = config.app.entrypoint;

  if (entrypoint === "run") {
    const analyzer = new NewsAnalyzer(config);
    await analyzer.run();
    return;
  }

  if (entrypoint === "bot") {
    const botConfig = getBotConfig(config);
    if (!botConfig.botToken) {
      logger.error(
        "Bot token is required. Set TELEGRAM_BOT_TOKEN or configure bot.bot_token",
      );
      process.exit(1);
    }
    if (botConfig.enabled === false) {
      logger.warn("Bot entrypoint selected but bot.enabled=false; exiting");
      return;
    }

    const appContext = new AppContext(config);
    const bot = new TrendRadarBot(appContext, botConfig);
    await bot.start();
    return;
  }

  if (entrypoint === "both") {
    const analyzer = new NewsAnalyzer(config);
    await analyzer.run();

    const botConfig = getBotConfig(config);
    if (!botConfig.botToken) {
      logger.error(
        "Bot token is required. Set TELEGRAM_BOT_TOKEN or configure bot.bot_token",
      );
      process.exit(1);
    }
    if (botConfig.enabled === false) {
      logger.warn("Bot is disabled (bot.enabled=false); skipping bot start");
      return;
    }

    const appContext = new AppContext(config);
    const bot = new TrendRadarBot(appContext, botConfig);
    await bot.start();
    return;
  }

  logger.error(
    `Invalid app.entrypoint: ${entrypoint}. Must be one of: run, bot, both`,
  );
  process.exit(1);
}

// Run if executed directly
main().catch((error) => {
  logger.error({ error }, "Fatal error");
  process.exit(1);
});
