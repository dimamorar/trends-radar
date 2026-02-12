/**
 * Cluster Scoring Module
 *
 * Score news clusters based on cross-source diversity and mention count.
 * Filter out noise clusters that don't meet minimum thresholds.
 */

import type { NewsCluster } from "./clustering.js";
import { logger } from "../utils/logger.js";

/**
 * Scoring configuration
 */
export interface ScoringConfig {
  /** Exponent for source diversity weight (default 1.4) */
  sourceExponent: number;
  /** Minimum distinct sources to keep a cluster (default 1) */
  minSources: number;
  /** Minimum mentions when cluster has only 1 source (default 3) */
  minMentions: number;
}

/**
 * Scored cluster with computed score and metadata
 */
export interface ScoredCluster extends NewsCluster {
  score: number;
  distinctSources: number;
  totalMentions: number;
}

/**
 * Get all articles in a cluster (primary + related)
 */
function getAllArticles(cluster: NewsCluster) {
  return [cluster.primary, ...cluster.related];
}

/**
 * Count distinct sources (feedId / source) in a cluster
 */
function countDistinctSources(cluster: NewsCluster): number {
  const sources = new Set<string>();
  for (const article of getAllArticles(cluster)) {
    sources.add(article.source);
  }
  return sources.size;
}

/**
 * Compute score for a single cluster.
 *
 * Formula: (distinct_sources ^ sourceExponent) * log(1 + total_mentions)
 */
export function scoreCluster(
  cluster: NewsCluster,
  config: Partial<ScoringConfig> = {},
): ScoredCluster {
  const sourceExponent = config.sourceExponent ?? 1.4;
  const totalMentions = getAllArticles(cluster).length;
  const distinctSources = countDistinctSources(cluster);

  const score = distinctSources ** sourceExponent * Math.log(1 + totalMentions);

  return {
    ...cluster,
    score,
    distinctSources,
    totalMentions,
  };
}

/**
 * Score and filter clusters.
 * Removes noise clusters that don't meet minimum thresholds.
 * Returns sorted by score descending.
 */
export function scoreAndFilterClusters(
  clusters: NewsCluster[],
  scoringConfig: ScoringConfig,
): ScoredCluster[] {
  const scored = clusters.map((c) => scoreCluster(c, scoringConfig));

  // Filter out noise
  const filtered = scored.filter((c) => {
    // Drop clusters with single source AND fewer than minMentions
    if (c.distinctSources <= 1 && c.totalMentions < scoringConfig.minMentions) {
      return false;
    }
    // Drop clusters below minimum source threshold
    if (c.distinctSources < scoringConfig.minSources) {
      return false;
    }
    return true;
  });

  // Sort by score descending
  filtered.sort((a, b) => b.score - a.score);

  const removed = scored.length - filtered.length;
  if (removed > 0) {
    logger.info(
      `[Scoring] Filtered ${removed} noise cluster(s) (${scored.length} -> ${filtered.length})`,
    );
  }

  logger.info(
    `[Scoring] Top clusters: ${filtered
      .slice(0, 5)
      .map((c) => `${c.score.toFixed(1)}`)
      .join(", ")}`,
  );

  return filtered;
}
