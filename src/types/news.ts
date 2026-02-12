/**
 * News data types
 */

/**
 * Individual news item from a platform
 */
export interface NewsItem {
  title: string;
  platformId: string;
  rank: number;
  url?: string;
  mobileUrl?: string;
  firstCrawlTime: string;
  lastCrawlTime: string;
  crawlCount: number;
  ranks: number[];
  rankTimeline?: Array<{ rank: number; time: string }>;
}

/**
 * News data for a specific day
 */
export interface NewsData {
  date: string;
  crawlTime: string;
  items: Record<string, NewsItem[]>;
  idToName: Record<string, string>;
}

/**
 * Title metadata
 */
export interface TitleInfo {
  title: string;
  sourceName: string;
  sourceId: string;
  firstTime: string;
  lastTime: string;
  timeDisplay: string;
  count: number;
  ranks: number[];
  rankThreshold: number;
  url?: string;
  mobileUrl?: string;
  isNew: boolean;
  matchedKeyword?: string;
}

/**
 * Statistics entry for a keyword
 */
export interface StatisticsEntry {
  word: string;
  displayName?: string;
  count: number;
  position: number;
  percentage: number;
  titles: TitleInfo[];
  maxCount?: number;
}

/**
 * Crawl record
 */
export interface CrawlRecord {
  id?: number;
  crawlTime: string;
  totalItems: number;
}

/**
 * Crawl source status
 */
export interface CrawlSourceStatus {
  crawlRecordId: number;
  platformId: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

/**
 * Push record for tracking notifications
 */
export interface PushRecord {
  id?: number;
  date: string;
  pushed: boolean;
  pushTime?: string;
  reportType?: string;
}
