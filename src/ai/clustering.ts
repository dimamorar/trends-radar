/**
 * News Clustering Module
 *
 * Group similar articles by embedding similarity using agglomerative clustering
 */

// Integrated into NewsAnalyzer.runAIPipeline() pipeline
// Scoring is in scoring.ts, report rendering in notification/renderer.ts

import { logger } from "../utils/logger.js";

/**
 * Article prepared for clustering (no classifier dependency)
 */
export interface ClassifiedArticle {
  id: string;
  title: string;
  content?: string;
  source: string;
  url?: string;
  pubDate?: Date;
  embedding?: number[];
}

/**
 * News cluster containing related articles
 */
export interface NewsCluster {
  id: string;
  primary: ClassifiedArticle;
  related: ClassifiedArticle[];
  memberCount: number;
  centroid: number[];
}

/**
 * Clusterer configuration
 */
export interface ClustererConfig {
  similarityThreshold: number; // e.g., 0.85
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Compute centroid of a set of vectors
 */
function computeCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    return [];
  }

  const dim = vectors[0].length;
  const centroid = new Array(dim).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += vector[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] /= vectors.length;
  }

  return centroid;
}

/**
 * Generate a unique cluster ID
 */
function generateClusterId(): string {
  return `cluster_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Clusterer for grouping similar news articles
 */
export class Clusterer {
  private similarityThreshold: number;

  constructor(config: ClustererConfig) {
    this.similarityThreshold = config.similarityThreshold;
  }

  /**
   * Build clusters from articles using their embeddings
   * Uses single-linkage agglomerative clustering
   *
   * @param articles - Classified articles with embeddings (each must have `.embedding`)
   * @returns Array of news clusters
   */
  buildClusters(articles: ClassifiedArticle[]): NewsCluster[] {
    const missing = articles.filter((a) => !a.embedding);
    if (missing.length > 0) {
      throw new Error(
        `${missing.length} article(s) missing embeddings – cannot cluster`,
      );
    }

    const assigned = new Set<number>();
    const clusters: NewsCluster[] = [];

    for (let idx = 0; idx < articles.length; idx++) {
      if (assigned.has(idx)) {
        continue;
      }

      const article = articles[idx];
      const articleEmbedding = article.embedding as number[];

      const clusterMembers: ClassifiedArticle[] = [article];
      const clusterEmbeddings: number[][] = [articleEmbedding];
      assigned.add(idx);

      for (let j = 0; j < articles.length; j++) {
        if (assigned.has(j)) {
          continue;
        }

        const similarity = cosineSimilarity(
          articleEmbedding,
          articles[j].embedding as number[],
        );
        if (similarity >= this.similarityThreshold) {
          clusterMembers.push(articles[j]);
          clusterEmbeddings.push(articles[j].embedding as number[]);
          assigned.add(j);
        }
      }

      const primary = this.selectPrimary(clusterMembers);
      const related = clusterMembers.filter((a) => a.id !== primary.id);
      const centroid = computeCentroid(clusterEmbeddings);

      clusters.push({
        id: generateClusterId(),
        primary,
        related,
        memberCount: clusterMembers.length,
        centroid,
      });
    }

    logger.info(
      `[Clusterer] Created ${clusters.length} clusters from ${articles.length} articles`,
    );

    // Sort by member count descending (scoring will re-sort by score later)
    clusters.sort((a, b) => b.memberCount - a.memberCount);

    return clusters;
  }

  /**
   * Select the primary (most representative) article from a cluster
   * Selection criteria: longest content, then longest title
   *
   * @param articles - Articles in the cluster
   * @returns The primary article
   */
  selectPrimary(articles: ClassifiedArticle[]): ClassifiedArticle {
    if (articles.length === 0) {
      throw new Error("Cannot select primary from empty cluster");
    }

    if (articles.length === 1) {
      return articles[0];
    }

    const sorted = [...articles].sort((a, b) => {
      const aLength = a.content?.length ?? 0;
      const bLength = b.content?.length ?? 0;
      if (bLength !== aLength) {
        return bLength - aLength;
      }
      return (b.title?.length ?? 0) - (a.title?.length ?? 0);
    });

    return sorted[0];
  }

  /**
   * Merge two clusters if they are similar enough
   * @param cluster1 - First cluster
   * @param cluster2 - Second cluster
   * @returns Merged cluster or null if not similar enough
   */
  mergeClusters(
    cluster1: NewsCluster,
    cluster2: NewsCluster,
  ): NewsCluster | null {
    const similarity = cosineSimilarity(cluster1.centroid, cluster2.centroid);

    if (similarity < this.similarityThreshold) {
      return null;
    }

    const allArticles = [
      cluster1.primary,
      ...cluster1.related,
      cluster2.primary,
      ...cluster2.related,
    ];
    const allEmbeddings = allArticles
      .map((a) => a.embedding)
      .filter((e): e is number[] => e !== undefined);

    const primary = this.selectPrimary(allArticles);
    const related = allArticles.filter((a) => a.id !== primary.id);
    const centroid = computeCentroid(allEmbeddings);

    return {
      id: generateClusterId(),
      primary,
      related,
      memberCount: allArticles.length,
      centroid,
    };
  }

  /**
   * Get the similarity threshold
   */
  getSimilarityThreshold(): number {
    return this.similarityThreshold;
  }
}

/**
 * Create a clusterer from config
 */
export function createClusterer(config: ClustererConfig): Clusterer {
  return new Clusterer(config);
}
