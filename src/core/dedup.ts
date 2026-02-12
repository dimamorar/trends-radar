/**
 * Title-based Deduplication
 *
 * Simple deduplication using title similarity matching.
 * No embeddings required - uses string normalization and character overlap.
 * Also provides fingerprint-based hard dedup for RSS items.
 */

import type { RssItem, StatisticsEntry, TitleInfo } from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * Configuration for deduplication
 */
export interface DedupConfig {
  /** Similarity threshold (0-1). Titles above this are considered duplicates. Default: 0.85 */
  similarityThreshold?: number;
  /** Whether to log dedup actions. Default: false */
  verbose?: boolean;
}

/**
 * Normalize a title for comparison
 * - Convert to lowercase
 * - Remove punctuation and special characters
 * - Collapse multiple whitespace
 * - Trim
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // Keep letters, numbers, whitespace (Unicode-aware)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate character-level Jaccard similarity between two strings
 * Uses character trigrams for better accuracy with short texts
 */
export function calculateSimilarity(a: string, b: string): number {
  const normalizedA = normalizeTitle(a);
  const normalizedB = normalizeTitle(b);

  if (normalizedA === normalizedB) return 1;
  if (!normalizedA || !normalizedB) return 0;

  // Use trigrams for comparison
  const trigramsA = getTrigrams(normalizedA);
  const trigramsB = getTrigrams(normalizedB);

  if (trigramsA.size === 0 && trigramsB.size === 0) return 1;
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  // Jaccard similarity: |A ∩ B| / |A ∪ B|
  let intersection = 0;
  for (const trigram of trigramsA) {
    if (trigramsB.has(trigram)) {
      intersection++;
    }
  }

  const union = trigramsA.size + trigramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Get character trigrams from a string
 */
function getTrigrams(str: string): Set<string> {
  const trigrams = new Set<string>();
  if (str.length < 3) {
    trigrams.add(str);
    return trigrams;
  }

  for (let i = 0; i <= str.length - 3; i++) {
    trigrams.add(str.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Calculate a score for a TitleInfo to determine which duplicate to keep
 * Higher score = better candidate to keep
 */
function scoreTitleInfo(info: TitleInfo): number {
  // Factors:
  // 1. Number of appearances (count)
  // 2. Best rank position (lower = better)
  // 3. Recency (more recent lastTime = better)

  const countScore = info.count * 10;
  const rankScore =
    info.ranks.length > 0 ? (11 - Math.min(info.ranks[0], 10)) * 5 : 0;

  // Parse time for recency (optional bonus)
  let recencyScore = 0;
  try {
    const lastTime = new Date(info.lastTime).getTime();
    if (!Number.isNaN(lastTime)) {
      // Normalize to 0-10 based on how recent (within last 24h)
      const age = Date.now() - lastTime;
      const dayMs = 24 * 60 * 60 * 1000;
      recencyScore = Math.max(0, 10 - (age / dayMs) * 10);
    }
  } catch {
    // Failed to parse time for recency score
  }

  return countScore + rankScore + recencyScore;
}

/**
 * Deduplicate titles within a StatisticsEntry
 * Returns a new StatisticsEntry with duplicates removed
 */
export function deduplicateTitles(
  entry: StatisticsEntry,
  config: DedupConfig = {},
): StatisticsEntry {
  const threshold = config.similarityThreshold ?? 0.85;
  const verbose = config.verbose ?? false;

  if (entry.titles.length <= 1) {
    return entry;
  }

  // Group similar titles
  const groups: TitleInfo[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < entry.titles.length; i++) {
    if (assigned.has(i)) continue;

    const group: TitleInfo[] = [entry.titles[i]];
    assigned.add(i);

    for (let j = i + 1; j < entry.titles.length; j++) {
      if (assigned.has(j)) continue;

      const similarity = calculateSimilarity(
        entry.titles[i].title,
        entry.titles[j].title,
      );

      if (similarity >= threshold) {
        group.push(entry.titles[j]);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  // For each group, keep the title with the highest score
  const dedupedTitles: TitleInfo[] = [];

  for (const group of groups) {
    if (group.length === 1) {
      dedupedTitles.push(group[0]);
    } else {
      // Find best candidate
      let best = group[0];
      let bestScore = scoreTitleInfo(best);

      for (let i = 1; i < group.length; i++) {
        const score = scoreTitleInfo(group[i]);
        if (score > bestScore) {
          best = group[i];
          bestScore = score;
        }
      }

      // Merge metadata from duplicates into best
      const merged: TitleInfo = {
        ...best,
        count: group.reduce((sum, t) => sum + t.count, 0),
        ranks: group.flatMap((t) => t.ranks).sort((a, b) => a - b),
      };

      dedupedTitles.push(merged);
    }
  }

  const removedCount = entry.titles.length - dedupedTitles.length;

  if (verbose && removedCount > 0) {
    logger.info(`[Dedup] ${entry.word}: removed ${removedCount} duplicate(s)`);
  }

  return {
    ...entry,
    titles: dedupedTitles,
    count: dedupedTitles.length,
  };
}

/**
 * Deduplicate all StatisticsEntry items
 */
export function deduplicateStats(
  stats: StatisticsEntry[],
  config: DedupConfig = {},
): StatisticsEntry[] {
  if (stats.length === 0) {
    return stats;
  }

  const startTotal = stats.reduce((sum, s) => sum + s.titles.length, 0);

  const dedupedStats = stats.map((entry) => deduplicateTitles(entry, config));

  const endTotal = dedupedStats.reduce((sum, s) => sum + s.titles.length, 0);
  const removed = startTotal - endTotal;

  if (removed > 0) {
    logger.info(
      `[Dedup] Removed ${removed} duplicate title(s) (${startTotal} → ${endTotal})`,
    );
  }

  return dedupedStats;
}

/**
 * Cross-keyword deduplication
 * Removes titles that appear in multiple keyword groups, keeping only in the highest-priority group
 */
export function deduplicateAcrossKeywords(
  stats: StatisticsEntry[],
  config: DedupConfig = {},
): StatisticsEntry[] {
  const threshold = config.similarityThreshold ?? 0.85;

  if (stats.length <= 1) {
    return stats;
  }

  // Build a map of normalized titles to their first occurrence (highest priority keyword)
  const seenTitles = new Map<
    string,
    { keywordIndex: number; normalized: string }
  >();

  const result = stats.map((entry, keywordIndex) => {
    const filteredTitles: TitleInfo[] = [];

    for (const titleInfo of entry.titles) {
      const normalized = normalizeTitle(titleInfo.title);

      // Check if this title (or similar) already seen
      let isDuplicate = false;
      for (const [, seen] of seenTitles) {
        if (seen.keywordIndex === keywordIndex) continue;

        const similarity = calculateSimilarity(
          titleInfo.title,
          seen.normalized,
        );
        if (similarity >= threshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        filteredTitles.push(titleInfo);
        seenTitles.set(normalized, { keywordIndex, normalized });
      }
    }

    return {
      ...entry,
      titles: filteredTitles,
      count: filteredTitles.length,
    };
  });

  const startTotal = stats.reduce((sum, s) => sum + s.titles.length, 0);
  const endTotal = result.reduce((sum, s) => sum + s.titles.length, 0);
  const removed = startTotal - endTotal;

  if (removed > 0) {
    logger.info(`[Dedup] Cross-keyword: removed ${removed} duplicate(s)`);
  }

  return result;
}

/**
 * Compute a fingerprint hash for an RSS item.
 * Uses normalized title + summary to detect same story with different URLs.
 */
export function computeFingerprint(title: string, summary?: string): string {
  const text = normalizeTitle(`${title} ${summary || ""}`);
  // Simple hash (Bun-compatible): djb2
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function deduplicateRssItems(items: RssItem[]): RssItem[] {
  if (items.length === 0) return [];

  const seenUrls = new Set<string>();
  const deduped: RssItem[] = [];

  for (const item of items) {
    if (seenUrls.has(item.url)) {
      continue;
    }
    seenUrls.add(item.url);

    deduped.push(item);
  }

  return deduped;
}
