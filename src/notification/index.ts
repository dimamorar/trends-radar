/**
 * Notification module exports
 */

export {
  createNotificationDispatcher,
  type DispatcherOptions,
  type DispatchResult,
  type DispatchResults,
  NotificationDispatcher,
} from './dispatcher.js';
export {
  escapeHtml,
  escapeMarkdown,
  formatRankDisplay,
  type RenderOptions,
  type ReportData,
  renderHtmlContent,
  renderPlainTextContent,
  renderRssSummary,
} from './renderer.js';
export {
  sendTelegramMessage,
  sendToTelegram,
  type TelegramSenderOptions,
} from './senders/index.js';
export {
  addBatchHeaders,
  getPlatformLimit,
  PLATFORM_LIMITS,
  splitForPlatform,
  splitIntoBatches,
  truncateToBytes,
} from './splitter.js';
