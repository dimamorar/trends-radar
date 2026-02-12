/**
 * Core module exports
 */

export type { DedupConfig } from './dedup';
export {
  calculateSimilarity,
  computeFingerprint,
  deduplicateAcrossKeywords,
  deduplicateRssItems,
  deduplicateStats,
  deduplicateTitles,
  normalizeTitle,
} from './dedup';
export {
  getAccountAtIndex,
  limitAccounts,
  loadConfig,
  parseMultiAccountConfig,
  validatePairedConfigs,
} from './config';
export type { CleanTitleFn, CrawlResults, TitleData, TitleInfoMap } from './data';
export {
  crawlResultsToNewsItems,
  newsDataToCrawlResults,
  saveTitlesToFile,
} from './data';
