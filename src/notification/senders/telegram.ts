/**
 * Telegram Notification Sender
 *
 * Sends notifications to Telegram using grammy library
 */

import { Bot } from 'grammy';
import { logger } from '../../utils/logger.js';

/**
 * Telegram sender options
 */
export interface TelegramSenderOptions {
  botToken: string;
  chatId: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
  batchInterval?: number; // ms between batches
}

/**
 * Send message to Telegram
 */
export async function sendToTelegram(
  options: TelegramSenderOptions,
  messages: string[],
  accountLabel = '',
): Promise<boolean> {
  const {
    botToken,
    chatId,
    parseMode = 'HTML',
    disableWebPagePreview = true,
    batchInterval = 1000,
  } = options;

  const logPrefix = accountLabel ? `Telegram${accountLabel}` : 'Telegram';

  if (!botToken || !chatId) {
    logger.error(`${logPrefix}: Missing botToken or chatId`);
    return false;
  }

  const bot = new Bot(botToken);

  logger.info(`${logPrefix}: Sending ${messages.length} message(s)`);

  let successCount = 0;
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    try {
      await bot.api.sendMessage(chatId, message, {
        parse_mode: parseMode,
        link_preview_options: { is_disabled: disableWebPagePreview },
      });

      successCount++;
      logger.info(`${logPrefix}: Batch ${i + 1}/${messages.length} sent (${message.length} chars)`);

      // Add interval between batches
      if (i < messages.length - 1 && batchInterval > 0) {
        await sleep(batchInterval);
      }
    } catch (error) {
      logger.error({ error }, `${logPrefix}: Failed to send batch ${i + 1}/${messages.length}`);
    }
  }

  if (successCount > 0) {
    logger.info(`${logPrefix}: ${successCount}/${messages.length} batches sent successfully`);
    return true;
  }

  return false;
}

/**
 * Send single message to Telegram (convenience method)
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string,
  parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML',
): Promise<boolean> {
  return sendToTelegram({ botToken, chatId, parseMode }, [message]);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default sendToTelegram;
