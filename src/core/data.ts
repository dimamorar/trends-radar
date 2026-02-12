/**
 * Data processing module
 *
 * Provides data reading, saving, and detection functions.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StorageManager } from "../storage/manager.js";
import type { NewsData, NewsItem } from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * Title data structure from crawl results
 */
export interface TitleData {
  ranks: number[];
  count?: number;
  url?: string;
  mobileUrl?: string;
  firstTime?: string;
  lastTime?: string;
  rankTimeline?: Array<{ rank: number; time: string }>;
}

/**
 * Crawl results structure (sourceId -> title -> TitleData)
 */
export type CrawlResults = Record<string, Record<string, TitleData>>;

/**
 * Title info map with detailed timing information
 */
export type TitleInfoMap = Record<string, Record<string, TitleData>>;

/**
 * Clean title function type
 */
export type CleanTitleFn = (title: string) => string;

/**
 * Save titles to TXT file
 */
export function saveTitlesToFile(
  results: CrawlResults,
  idToName: Record<string, string>,
  failedIds: string[],
  outputPath: string,
  cleanTitleFn: CleanTitleFn,
): string {
  // Ensure directory exists
  mkdirSync(dirname(outputPath), { recursive: true });

  const lines: string[] = [];

  for (const [idValue, titleData] of Object.entries(results)) {
    // id | name or id
    const name = idToName[idValue];
    if (name && name !== idValue) {
      lines.push(`${idValue} | ${name}`);
    } else {
      lines.push(idValue);
    }

    // Sort by rank
    const sortedTitles: Array<{
      rank: number;
      title: string;
      url: string;
      mobileUrl: string;
    }> = [];

    for (const [title, info] of Object.entries(titleData)) {
      const cleanedTitle = cleanTitleFn(title);
      const ranks = info.ranks || [];
      const url = info.url || "";
      const mobileUrl = info.mobileUrl || "";
      const rank = ranks[0] || 1;

      sortedTitles.push({ rank, title: cleanedTitle, url, mobileUrl });
    }

    sortedTitles.sort((a, b) => a.rank - b.rank);

    for (const { rank, title, url, mobileUrl } of sortedTitles) {
      let line = `${rank}. ${title}`;
      if (url) line += ` [URL:${url}]`;
      if (mobileUrl) line += ` [MOBILE:${mobileUrl}]`;
      lines.push(line);
    }

    lines.push("");
  }

  if (failedIds.length > 0) {
    lines.push("==== Failed IDs ====");
    for (const id of failedIds) {
      lines.push(id);
    }
  }

  writeFileSync(outputPath, lines.join("\n"), "utf-8");
  return outputPath;
}

/**
 * Read all today's titles from storage
 */
export async function readAllTodayTitlesFromStorage(
  storageManager: StorageManager,
): Promise<{
  allResults: CrawlResults;
  idToName: Record<string, string>;
  titleInfo: TitleInfoMap;
  error?: boolean;
}> {
  try {
    const newsData = await storageManager.getTodayAllData();

    if (!newsData || Object.keys(newsData.items).length === 0) {
      return { allResults: {}, idToName: {}, titleInfo: {} };
    }

    const allResults: CrawlResults = {};
    const finalIdToName: Record<string, string> = {};
    const titleInfo: TitleInfoMap = {};

    for (const [sourceId, newsList] of Object.entries(newsData.items)) {
      // Get source name
      const sourceName = newsData.idToName[sourceId] || sourceId;
      finalIdToName[sourceId] = sourceName;

      if (!allResults[sourceId]) {
        allResults[sourceId] = {};
        titleInfo[sourceId] = {};
      }

      for (const item of newsList) {
        const title = item.title;
        const ranks = item.ranks || [item.rank];
        const firstTime = item.firstCrawlTime;
        const lastTime = item.lastCrawlTime;
        const count = item.crawlCount || 1;
        const rankTimeline = item.rankTimeline || [];

        allResults[sourceId][title] = {
          ranks,
          url: item.url || "",
          mobileUrl: item.mobileUrl || "",
        };

        titleInfo[sourceId][title] = {
          firstTime,
          lastTime,
          count,
          ranks,
          url: item.url || "",
          mobileUrl: item.mobileUrl || "",
          rankTimeline,
        };
      }
    }

    return { allResults, idToName: finalIdToName, titleInfo };
  } catch (error) {
    logger.error({ error }, "Failed to read data from storage");
    return { allResults: {}, idToName: {}, titleInfo: {}, error: true };
  }
}

/**
 * Read all today's titles
 */
export async function readAllTodayTitles(
  storageManager: StorageManager,
  quiet = false,
): Promise<{
  allResults: CrawlResults;
  idToName: Record<string, string>;
  titleInfo: TitleInfoMap;
}> {
  const result = await readAllTodayTitlesFromStorage(
    storageManager,
  );

  if (!quiet) {
    if (Object.keys(result.allResults).length > 0) {
      const totalCount = Object.values(result.allResults).reduce(
        (sum, titles) => sum + Object.keys(titles).length,
        0,
      );
      logger.info(`Read ${totalCount} titles from storage`);
    } else {
      logger.info("No data for today");
    }
  }

  return result;
}

/**
 * Detect new titles from latest crawl
 */
export async function detectLatestNewTitlesFromStorage(
  storageManager: StorageManager,
): Promise<CrawlResults> {
  try {
    // Get latest crawl data
    const latestData = await storageManager.getLatestCrawlData();
    if (!latestData || Object.keys(latestData.items).length === 0) {
      return {};
    }

    // Get all historical data
    const allData = await storageManager.getTodayAllData();
    if (!allData || Object.keys(allData.items).length === 0) {
      return {};
    }

    const latestTime = latestData.crawlTime;

    // Collect latest batch titles
    const latestTitles: CrawlResults = {};
    for (const [sourceId, newsList] of Object.entries(latestData.items)) {
      latestTitles[sourceId] = {};
      for (const item of newsList) {
        latestTitles[sourceId][item.title] = {
          ranks: [item.rank],
          url: item.url || "",
          mobileUrl: item.mobileUrl || "",
        };
      }
    }

    // Collect historical titles
    const historicalTitles: Record<string, Set<string>> = {};
    for (const [sourceId, newsList] of Object.entries(allData.items)) {
      historicalTitles[sourceId] = new Set();
      for (const item of newsList) {
        const firstTime = item.firstCrawlTime;
        if (firstTime < latestTime) {
          historicalTitles[sourceId].add(item.title);
        }
      }
    }

    // Check if first crawl (no historical data)
    const hasHistoricalData = Object.values(historicalTitles).some(
      (titles) => titles.size > 0,
    );
    if (!hasHistoricalData) {
      return {};
    }

    // Find new titles = latest - historical
    const newTitles: CrawlResults = {};
    for (const [sourceId, sourceLatestTitles] of Object.entries(latestTitles)) {
      const historicalSet = historicalTitles[sourceId] || new Set();
      const sourceNewTitles: Record<string, TitleData> = {};

      for (const [title, titleData] of Object.entries(sourceLatestTitles)) {
        if (!historicalSet.has(title)) {
          sourceNewTitles[title] = titleData;
        }
      }

      if (Object.keys(sourceNewTitles).length > 0) {
        newTitles[sourceId] = sourceNewTitles;
      }
    }

    return newTitles;
  } catch (error) {
    logger.error({ error }, "Failed to detect new titles from storage");
    return {};
  }
}

/**
 * Detect latest new titles
 */
export async function detectLatestNewTitles(
  storageManager: StorageManager,
  quiet = false,
): Promise<CrawlResults> {
  const newTitles = await detectLatestNewTitlesFromStorage(
    storageManager,
  );

  if (!quiet && Object.keys(newTitles).length > 0) {
    const totalNew = Object.values(newTitles).reduce(
      (sum, titles) => sum + Object.keys(titles).length,
      0,
    );
    logger.info(`Detected ${totalNew} new titles`);
  }

  return newTitles;
}

/**
 * Transform NewsData items to CrawlResults format
 */
export function newsDataToCrawlResults(newsData: NewsData): CrawlResults {
  const results: CrawlResults = {};

  for (const [sourceId, items] of Object.entries(newsData.items)) {
    results[sourceId] = {};
    for (const item of items) {
      results[sourceId][item.title] = {
        ranks: item.ranks,
        url: item.url,
        mobileUrl: item.mobileUrl,
      };
    }
  }

  return results;
}

/**
 * Transform CrawlResults to NewsItem array
 */
export function crawlResultsToNewsItems(
  results: CrawlResults,
  crawlTime: string,
): Record<string, NewsItem[]> {
  const items: Record<string, NewsItem[]> = {};

  for (const [sourceId, titles] of Object.entries(results)) {
    items[sourceId] = [];
    for (const [title, data] of Object.entries(titles)) {
      items[sourceId].push({
        title,
        platformId: sourceId,
        rank: data.ranks[0] || 99,
        ranks: data.ranks,
        url: data.url,
        mobileUrl: data.mobileUrl,
        firstCrawlTime: crawlTime,
        lastCrawlTime: crawlTime,
        crawlCount: 1,
      });
    }
  }

  return items;
}
