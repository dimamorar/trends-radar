/**
 * RSS feed types
 */

/**
 * RSS feed configuration
 */
export interface RssFeedConfig {
  id: string;
  name: string;
  url: string;
  enabled?: boolean;
  category?: string;
}

/**
 * RSS feed metadata stored in database
 */
export interface RssFeed {
  id: string;
  name: string;
  feedUrl?: string;
  isActive: boolean;
  lastFetchTime?: string;
  lastFetchStatus?: 'success' | 'failed';
  itemCount: number;
}

/**
 * Individual RSS item
 */
export interface RssItem {
  id?: number;
  feedId: string;
  feedName?: string;
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
  author?: string;
  guid?: string;
  firstCrawlTime: string;
  lastCrawlTime: string;
  crawlCount: number;
}

/**
 * Parsed RSS item from feed
 */
export interface ParsedRssItem {
  title: string;
  link: string;
  pubDate?: string;
  content?: string;
  summary?: string;
  author?: string;
  guid?: string;
  categories?: string[];
}

/**
 * RSS crawl record
 */
export interface RssCrawlRecord {
  id?: number;
  crawlTime: string;
  totalItems: number;
}

/**
 * RSS crawl status
 */
export interface RssCrawlStatus {
  crawlRecordId: number;
  feedId: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

/**
 * RSS statistics for display
 */
export interface RssStats {
  feedId: string;
  feedName: string;
  items: RssItem[];
  newItems: RssItem[];
  totalCount: number;
}
