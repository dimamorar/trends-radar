/**
 * Cluster Summarizer
 *
 * Generate unified summaries for news clusters using Sonnet
 */

// Integrated into NewsAnalyzer.runAIPipeline() pipeline
// Report rendering is in notification/renderer.ts renderClusterReport()
// TODO: Add caching for summaries to reduce API costs

import { Output, generateText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { ClusterSummarySchema, type ClusterSummaryOutput } from "./schemas.js";
import type { NewsCluster, ClassifiedArticle } from "./clustering.js";
import { logger } from "../utils/logger.js";

/**
 * Summary of a news cluster
 */
export interface ClusterSummary {
  clusterId: string;
  headline: string;
  summary: string;
  keyPoints: string[];
  perspectives: string[];
  importance: number;
  sources: Array<{ name: string; url: string }>;
}

/**
 * Summarizer configuration
 */
export interface ClusterSummarizerConfig {
  model: string; // e.g., "openai/gpt-4o-mini"
  apiKey: string;
  apiBase?: string;
  language?: string; // Output language (e.g., "Ukrainian")
}

/** Parse model string to OpenAI model ID (supports "openai/model" or "model"). */
function parseModelString(model: string): string {
  if (model.includes("/")) {
    const [, ...rest] = model.split("/");
    return rest.join("/");
  }
  return model;
}

/** Create a language model instance for summarization (OpenAI only). */
function createLanguageModel(
  modelId: string,
  apiKey: string,
  apiBase?: string,
): LanguageModel {
  const openai = createOpenAI({
    apiKey,
    ...(apiBase && { baseURL: apiBase }),
  });
  return openai(modelId);
}

/**
 * Format article for prompt
 */
function formatArticle(article: ClassifiedArticle, index: number): string {
  const parts = [
    `Article ${index + 1}:`,
    `  Title: ${article.title}`,
    `  Source: ${article.source}`,
  ];

  if (article.content) {
    const truncatedContent =
      article.content.length > 500
        ? `${article.content.substring(0, 500)}...`
        : article.content;
    parts.push(`  Content: ${truncatedContent}`);
  }

  return parts.join("\n");
}

/**
 * Cluster summarizer using AI
 */
export class ClusterSummarizer {
  private model: LanguageModel;
  private modelString: string;
  private language: string;

  constructor(config: ClusterSummarizerConfig) {
    this.modelString = config.model;
    this.language = config.language ?? "English";

    const modelId = parseModelString(config.model);
    this.model = createLanguageModel(modelId, config.apiKey, config.apiBase);
  }

  /**
   * Build prompt for cluster summarization
   */
  private buildPrompt(cluster: NewsCluster): string {
    const allArticles = [cluster.primary, ...cluster.related];

    const articleTexts = allArticles
      .map((article, i) => formatArticle(article, i))
      .join("\n\n");

    const sourceList = allArticles.map((a) => a.source).join(", ");

    return `Summarize the following cluster of ${allArticles.length} related news articles from: ${sourceList}

${articleTexts}

Create a unified summary that:
1. Provides a concise headline (max 100 characters)
2. Synthesizes the key information from all articles
3. Identifies the key points (max 5)
4. Notes any different perspectives or viewpoints from the sources (max 3)
5. Assigns an overall importance score (0-1) based on the impact and significance

IMPORTANT: Write the headline, summary, key points, and perspectives in ${this.language}.`;
  }

  /**
   * Extract source information from articles
   */
  private extractSources(
    cluster: NewsCluster,
  ): Array<{ name: string; url: string }> {
    const allArticles = [cluster.primary, ...cluster.related];
    const sources: Array<{ name: string; url: string }> = [];
    const seenSources = new Set<string>();

    for (const article of allArticles) {
      if (!seenSources.has(article.source)) {
        seenSources.add(article.source);
        sources.push({
          name: article.source,
          url: article.url ?? "",
        });
      }
    }

    return sources;
  }

  /**
   * Summarize a single cluster
   * @param cluster - News cluster to summarize
   * @returns Cluster summary
   */
  async summarize(cluster: NewsCluster): Promise<ClusterSummary> {
    const prompt = this.buildPrompt(cluster);

    const { output } = await generateText({
      model: this.model,
      output: Output.object({
        schema: ClusterSummarySchema,
      }),
      prompt,
    });

    const summary = output as ClusterSummaryOutput;

    return {
      clusterId: cluster.id,
      headline: summary.headline,
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      perspectives: summary.perspectives,
      importance: summary.importance,
      sources: this.extractSources(cluster),
    };
  }

  /**
   * Summarize multiple clusters
   * @param clusters - News clusters to summarize
   * @returns Array of cluster summaries
   */
  async summarizeBatch(clusters: NewsCluster[]): Promise<ClusterSummary[]> {
    if (clusters.length === 0) {
      logger.info("[Summarizer] No clusters to summarize");
      return [];
    }

    logger.info(`[Summarizer] Summarizing ${clusters.length} clusters`);

    const results: ClusterSummary[] = [];
    const errors: Array<{ clusterId: string; error: Error }> = [];

    for (const cluster of clusters) {
      try {
        const summary = await this.summarize(cluster);
        results.push(summary);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.warn(
          `[Summarizer] Failed to summarize cluster ${cluster.id}: ${err.message}`,
        );
        errors.push({ clusterId: cluster.id, error: err });
      }
    }

    if (errors.length > 0) {
      logger.warn(
        `[Summarizer] ${errors.length} clusters failed summarization`,
      );
    }

    logger.info(
      `[Summarizer] Successfully summarized ${results.length}/${clusters.length} clusters`,
    );

    results.sort((a, b) => b.importance - a.importance);

    return results;
  }

  /**
   * Get the model string
   */
  getModelString(): string {
    return this.modelString;
  }
}

/**
 * Create a cluster summarizer from config
 */
export function createClusterSummarizer(
  config: ClusterSummarizerConfig,
): ClusterSummarizer {
  return new ClusterSummarizer(config);
}
