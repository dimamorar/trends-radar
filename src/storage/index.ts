/**
 * Storage module exports
 */

export type { RssData, StorageBackend, StorageNewsData } from './base.js';
export {
  convertCrawlResultsToNewsData,
  convertNewsDataToResults,
  getNewsDataTotalCount,
  getRssDataTotalCount,
  mergeNewsData,
} from './base.js';

export { LocalStorageBackend } from './local.js';
export type { RemoteStorageConfig, StorageManagerOptions } from './manager.js';
export { getStorageManager, StorageManager } from './manager.js';
export { RemoteStorageBackend } from './remote.js';
