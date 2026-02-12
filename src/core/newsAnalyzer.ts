import { AIAnalyzer, type AIAnalysisResult } from "../ai/index";
import { EmbeddingService } from "../ai/embeddings";
import { Clusterer, type ClassifiedArticle } from "../ai/clustering";
import { ClusterSummarizer, type ClusterSummary } from "../ai/summarizer";
import { scoreAndFilterClusters, type ScoredCluster } from "../ai/scoring";
import { AppContext } from "./context";
import {
  deduplicateAcrossKeywords,
  deduplicateRssItems,
  deduplicateStats,
  type DedupConfig,
} from "./dedup";
import { RssFetcher, type RssFetchResult } from "../crawler/index";
import type { Config, RssItem, StatisticsEntry } from "../types/index";
import { logger } from "../utils/logger";
import { isSameDateInTimezone } from "../utils/time";
import {
  renderClusterReport,
  type ClusterReportTopic,
} from "../notification/renderer";
import { NotificationDispatcher } from "../notification/dispatcher";
import type { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

/** Convex API references (works without codegen) */
const convexApi = anyApi;

/** Result of crawling RSS feeds */
type RssCrawlResult = {
  rssItems: RssItem[] | null;
  rssNewItems: RssItem[] | null;
  rawRssItems: RssItem[] | null;
};

/** Result of the AI analysis pipeline */
export interface AIPipelineResult {
  topics: ClusterReportTopic[];
  clusters: ScoredCluster[];
  summaries: ClusterSummary[];
  totalItems: number;
  dedupedItems: number;
  clusterCount: number;
}

/** RSS data object for storage */
type RssStorageData = {
  date: string;
  crawlTime: string;
  items: Record<string, RssItem[]>;
  idToName: Record<string, string>;
  failedIds: string[];
};

export const VERSION = "1.0.0";

export const REPORT_MODES = ["daily", "current", "incremental"] as const;
export type ReportMode = (typeof REPORT_MODES)[number];

export function isReportMode(value: unknown): value is ReportMode {
  return (
    typeof value === "string" && REPORT_MODES.includes(value as ReportMode)
  );
}

export class NewsAnalyzer {
  private ctx: AppContext;
  private aiEnabled: boolean;
  private aiAnalyzer: AIAnalyzer | null = null;
  private dedupConfig: DedupConfig;

  constructor(config: Config) {
    if (config.runtime?.verbose) {
      logger.level = "debug";
    }

    this.ctx = new AppContext(config);

    //TODO: do we need this
    // Configure deduplication
    this.dedupConfig = {
      similarityThreshold: config.runtime?.dedupThreshold,
      verbose: config.runtime?.verbose,
    };
    // Initialize AI if enabled (after runtime overrides applied)
    this.aiEnabled = config.aiAnalysis.enabled;

    if (this.aiEnabled) {
      if (!config.ai.apiKey) {
        logger.warn(
          "AI enabled but no API key configured, disabling AI analysis",
        );
        this.aiEnabled = false;
      } else {
        this.aiAnalyzer = new AIAnalyzer(
          {
            model: config.ai.model,
            apiKey: config.ai.apiKey,
            apiBase: config.ai.apiBase,
            timeout: config.ai.timeout,
            fallbackModels: config.ai.fallbackModels,
            language: config.aiAnalysis.language,
            promptFile: config.aiAnalysis.promptFile,
            maxNews: config.aiAnalysis.maxNews,
            useStructuredOutput: config.aiAnalysis.useStructuredOutput,
          },
          () => this.ctx.getTime(),
        );
      }
    } else {
      logger.info("AI analysis disabled");
    }
  }

  /**
   * Check if running in dry-run mode
   */
  get isDryRun(): boolean {
    return this.ctx.config.runtime?.dryRun ?? false;
  }

  /**
   * Crawl RSS data - orchestrates fetching, filtering, saving, and new item detection
   */
  private async crawlRssData(): Promise<RssCrawlResult> {
    try {
      const fetchResult = await this.fetchRssFeeds();
      if (!fetchResult) {
        return { rssItems: null, rssNewItems: null, rawRssItems: null };
      }

      const { items: filteredItems, filteredCount } =
        this.filterRssItemsByDate(fetchResult);
      if (filteredCount > 0) {
        logger.info(
          `[RSS] Filtered out ${filteredCount} items not published on ${fetchResult.date}`,
        );
      }

      const rssData = await this.saveRssData(fetchResult, filteredItems);

      const rawRssItems = this.convertRssItemsToList({
        ...fetchResult,
        items: filteredItems,
      });

      const rssNewItems = await this.detectNewRssItems(rssData);

      return { rssItems: rawRssItems, rssNewItems, rawRssItems };
    } catch (error) {
      logger.error({ error }, "[RSS] Fetch failed");
      return { rssItems: null, rssNewItems: null, rawRssItems: null };
    }
  }

  /**
   * Fetch all RSS feeds
   */
  private async fetchRssFeeds(): Promise<RssFetchResult | null> {
    const rssFeeds = this.ctx.rssFeeds;
    const freshnessConfig = this.ctx.rssConfig.freshnessFilter;

    const fetcher = RssFetcher.fromConfig(
      {
        enabled: true,
        feeds: rssFeeds.map((f) => ({
          id: f.id,
          name: f.name,
          url: f.url,
          enabled: f.enabled,
        })),
        freshnessFilter: freshnessConfig,
      },
      this.ctx.timezone,
    );

    return fetcher.fetchAll();
  }

  /**
   * Filter RSS items to only include those published on the target date
   */
  private filterRssItemsByDate(result: RssFetchResult): {
    items: Map<string, RssItem[]>;
    filteredCount: number;
  } {
    const targetDate = result.date;
    let filteredCount = 0;
    const items = new Map<string, RssItem[]>();

    for (const [feedId, feedItems] of result.items) {
      const kept = feedItems.filter((item) => {
        if (!item.publishedAt) {
          filteredCount++;
          return false;
        }
        const parsed = new Date(item.publishedAt);
        if (Number.isNaN(parsed.getTime())) {
          filteredCount++;
          return false;
        }
        if (!isSameDateInTimezone(parsed, targetDate, this.ctx.timezone)) {
          filteredCount++;
          return false;
        }
        return true;
      });
      items.set(feedId, kept);
    }

    return { items, filteredCount };
  }

  /**
   * Save RSS data to storage
   */
  private async saveRssData(
    result: RssFetchResult,
    filteredItems: Map<string, RssItem[]>,
  ): Promise<RssStorageData> {
    const storage = this.ctx.getStorageManager();
    const rssData: RssStorageData = {
      date: result.date,
      crawlTime: result.crawlTime,
      items: Object.fromEntries(filteredItems),
      idToName: Object.fromEntries(result.idToName),
      failedIds: result.failedIds,
    };

    const saved = await storage.saveRssData(rssData);
    if (saved) {
      logger.info("[RSS] Data saved to storage");
    }

    return rssData;
  }

  /**
   * Detect new RSS items compared to existing storage
   */
  private async detectNewRssItems(
    rssData: RssStorageData,
  ): Promise<RssItem[] | null> {
    const storage = this.ctx.getStorageManager();
    const existingData = await storage.getRssData(rssData.date);

    if (!existingData) {
      return null;
    }

    const newItemsMap = await storage.detectNewRssItems(rssData);
    if (Object.keys(newItemsMap).length === 0) {
      return null;
    }

    const rssNewItems: RssItem[] = [];
    for (const items of Object.values(newItemsMap)) {
      rssNewItems.push(...items);
    }

    logger.info(`[RSS] Detected ${rssNewItems.length} new items`);
    return rssNewItems;
  }

  /**
   * Convert RSS result to list format
   */
  private convertRssItemsToList(result: RssFetchResult): RssItem[] {
    const items: RssItem[] = [];

    for (const [_feedId, feedItems] of result.items) {
      const feedName = result.idToName.get(_feedId) || _feedId;
      for (const item of feedItems) {
        items.push({
          ...item,
          feedId: _feedId,
          feedName,
        });
      }
    }

    return items;
  }

  /**
   * Run analysis pipeline
   * Note: Frequency words logic has been removed - returns empty stats
   */
  private async runAnalysisPipeline(options: {
    rssItems: RssItem[] | null;
    rssNewItems: RssItem[] | null;
  }): Promise<{
    stats: StatisticsEntry[];
    totalTitles: number;
  }> {
    // Frequency words removed - return empty stats
    // AI analysis will work with RSS items directly
    return { stats: [], totalTitles: options.rssItems?.length ?? 0 };
  }

  /**
   * Run AI analysis on the statistics
   */
  private async runAIAnalysis(options: {
    stats: StatisticsEntry[];
    rssItems: RssItem[] | null;
    reportType: string;
  }): Promise<AIAnalysisResult | null> {
    if (!this.aiEnabled || !this.aiAnalyzer) {
      return null;
    }

    const { stats, rssItems, reportType } = options;

    // Skip if no content to analyze
    const totalItems =
      stats.reduce((sum, s) => sum + s.titles.length, 0) +
      (rssItems?.length ?? 0);
    if (totalItems === 0) {
      logger.info("[AI] No content to analyze, skipping AI analysis");
      return null;
    }

    try {
      logger.info(`[AI] Starting analysis of ${totalItems} items...`);

      const result = await this.aiAnalyzer.analyze({
        stats,
        rssItems,
        reportMode: this.ctx.reportMode,
        reportType,
        keywords: stats.map((s) => s.word),
      });

      if (result.success) {
        logger.info(
          `[AI] Analysis complete: ${result.analyzedNews}/${result.totalNews} items analyzed`,
        );
      } else {
        logger.error(`[AI] Analysis failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      logger.error({ error }, "[AI] Analysis error");
      return null;
    }
  }

  /**
   * Generate embeddings for deduped items (with Convex cache) and persist articles.
   * Returns the ordered embedding vectors and a URL→Convex ID map.
   */
  private async generateAndPersistEmbeddings(
    dedupedItems: RssItem[],
    convex: ConvexHttpClient | null,
    pipelineConfig: NonNullable<Config["aiPipeline"]>,
  ): Promise<{
    allEmbeddings: number[][];
    urlToConvexId: Map<string, string>;
  }> {
    const embeddingModel = pipelineConfig.embedding?.model;
    const embeddingService = new EmbeddingService({
      model: embeddingModel,
      apiKey: this.ctx.config.ai.apiKey,
      apiBase: this.ctx.config.ai.apiBase,
    });

    // Check Convex embedding cache
    const cachedEmbeddings = new Map<string, number[]>();
    if (convex) {
      try {
        const urls = dedupedItems
          .map((item) => item.url)
          .filter(Boolean) as string[];
        if (urls.length > 0) {
          const cached = await convex.query(
            convexApi.articles.getArticlesByUrls,
            { urls },
          );
          for (const article of cached) {
            if (article.embedding) {
              cachedEmbeddings.set(article.url, article.embedding);
            }
          }
          logger.info(
            `[Convex] Embedding cache: ${cachedEmbeddings.size} hits, ${urls.length - cachedEmbeddings.size} new`,
          );
        }
      } catch (err) {
        logger.warn(
          { err },
          "[Convex] Embedding cache lookup failed, will embed all",
        );
      }
    }

    // Only embed articles that are NOT in cache
    const newItems = dedupedItems.filter(
      (item) => !item.url || !cachedEmbeddings.has(item.url),
    );

    let newEmbeddings: number[][] = [];
    if (newItems.length > 0) {
      const texts = newItems.map((item) =>
        `${item.title}\n\n${item.summary || ""}`.trim(),
      );
      newEmbeddings = await embeddingService.embedBatch(texts);
      logger.info(
        `[Pipeline] Generated ${newEmbeddings.length} new embeddings (${cachedEmbeddings.size} cached)`,
      );
    } else {
      logger.info(
        `[Pipeline] All ${dedupedItems.length} embeddings served from cache`,
      );
    }

    // Merge cached + new embeddings in original order
    let newIdx = 0;
    const allEmbeddings: number[][] = dedupedItems.map((item) => {
      if (item.url && cachedEmbeddings.has(item.url)) {
        return cachedEmbeddings.get(item.url) as number[];
      }
      return newEmbeddings[newIdx++];
    });

    // Save articles + embeddings to Convex
    const urlToConvexId = new Map<string, string>();
    if (convex) {
      try {
        const articlesToSave = dedupedItems
          .filter((item) => item.url)
          .map((item, i) => ({
            url: item.url,
            title: item.title,
            content: item.summary,
            feedId: item.feedId,
            feedName: item.feedName,
            publishedAt: item.publishedAt,
            embedding: allEmbeddings[i],
            embeddingModel,
          }));
        const results = await convex.mutation(
          convexApi.articles.upsertArticlesBatch,
          { articles: articlesToSave },
        );
        for (const r of results) {
          urlToConvexId.set(r.url, r._id);
        }
        logger.info(
          `[Convex] Saved ${results.length} articles with embeddings`,
        );
      } catch (err) {
        logger.warn({ err }, "[Convex] Failed to save articles, continuing");
      }
    }

    return { allEmbeddings, urlToConvexId };
  }

  /**
   * Run AI pipeline: dedup -> embed (with cache) -> cluster -> score -> summarize
   * When Convex is enabled, caches embeddings and persists clusters/summaries.
   */
  private async runAIPipeline(
    rssItems: RssItem[],
  ): Promise<AIPipelineResult | null> {
    const pipelineConfig = this.ctx.config.aiPipeline;

    if (!pipelineConfig) return null;

    const convex = this.ctx.getConvexClient();

    try {
      logger.info(
        `[Pipeline] Step 1: Deduplicating ${rssItems.length} items...`,
      );
      const dedupedItems = deduplicateRssItems(rssItems);

      if (dedupedItems.length === 0) {
        return null;
      }

      // Create pipeline run in Convex (if enabled)
      let convexRunId: string | null = null;
      if (convex) {
        try {
          convexRunId = await convex.mutation(convexApi.pipeline.createRun, {
            date: new Date().toISOString().split("T")[0],
            startedAt: new Date().toISOString(),
            totalItems: rssItems.length,
            dedupedItems: dedupedItems.length,
            embeddingModel: pipelineConfig.embedding.model,
            summaryModel: pipelineConfig.summarization.model,
            clusterThreshold: pipelineConfig.clustering.similarityThreshold,
          });
        } catch (err) {
          logger.warn(
            { err },
            "[Convex] Failed to create pipeline run, continuing without persistence",
          );
        }
      }

      logger.info(
        `[Pipeline] Step 2: Generating embeddings for ${dedupedItems.length} items...`,
      );
      const { allEmbeddings, urlToConvexId } =
        await this.generateAndPersistEmbeddings(
          dedupedItems,
          convex,
          pipelineConfig,
        );

      // Step 3: Adapt RssItems to ClassifiedArticle format
      logger.info(
        `[Pipeline] Step 3: Adapting ${dedupedItems.length} items to ClassifiedArticle format...`,
      );
      const articles: ClassifiedArticle[] = dedupedItems.map((item, i) => ({
        id: item.url || `item-${i}`,
        title: item.title,
        content: item.summary,
        source: item.feedId,
        url: item.url,
        pubDate: item.publishedAt ? new Date(item.publishedAt) : undefined,
        embedding: allEmbeddings[i],
      }));

      // Step 4: Cluster
      const threshold = pipelineConfig.clustering.similarityThreshold;
      logger.info(
        `[Pipeline] Step 4: Clustering ${articles.length} articles (threshold: ${threshold})...`,
      );

      const clusterer = new Clusterer({ similarityThreshold: threshold });
      const clusters = clusterer.buildClusters(articles);

      // Step 5: Score and filter
      logger.info("[Pipeline] Step 5: Scoring clusters...");
      const scoredClusters = scoreAndFilterClusters(
        clusters,
        pipelineConfig.scoring,
      );
      logger.info(
        `[Pipeline] Step 5: ${scoredClusters.length} clusters after scoring/filtering`,
      );

      // Step 6: No significant clusters found
      if (scoredClusters.length === 0) {
        logger.info("[Pipeline] Step 6: No significant clusters found");
        if (convex && convexRunId) {
          try {
            await convex.mutation(convexApi.pipeline.completeRun, {
              runId: convexRunId,
              completedAt: new Date().toISOString(),
              clusterCount: clusters.length,
              topicCount: 0,
            });
          } catch (_) {
            logger.warn("[Convex] Failed to complete pipeline run, continuing");
          }
        }
        return {
          topics: [],
          clusters: [],
          summaries: [],
          totalItems: rssItems.length,
          dedupedItems: dedupedItems.length,
          clusterCount: clusters.length,
        };
      }

      // Save clusters to Convex
      const clusterConvexIds = new Map<number, string>();
      if (convex && convexRunId) {
        try {
          for (let ci = 0; ci < scoredClusters.length; ci++) {
            const sc = scoredClusters[ci];
            const allClusterArticles = [sc.primary, ...sc.related];
            const memberArticleIds = allClusterArticles
              .map((a) => (a.url ? urlToConvexId.get(a.url) : undefined))
              .filter(Boolean) as string[];
            const primaryConvexId = sc.primary.url
              ? urlToConvexId.get(sc.primary.url)
              : undefined;

            if (primaryConvexId && memberArticleIds.length > 0) {
              const clusterId = await convex.mutation(
                convexApi.clusters.saveCluster,
                {
                  runId: convexRunId,
                  primaryArticleId: primaryConvexId,
                  memberCount: sc.memberCount,
                  score: sc.score,
                  distinctSources: sc.distinctSources,
                  totalMentions: sc.totalMentions,
                  memberArticleIds,
                },
              );
              clusterConvexIds.set(ci, clusterId);
            }
          }
          logger.info(`[Convex] Saved ${clusterConvexIds.size} clusters`);
        } catch (err) {
          logger.warn({ err }, "[Convex] Failed to save clusters, continuing");
        }
      }

      // Step 8: Summarize top N clusters
      const topClusters = scoredClusters.slice(
        0,
        pipelineConfig.summarization?.maxTopics,
      );

      logger.info(
        `[Pipeline] Step 8: Summarizing top ${topClusters.length} clusters...`,
      );

      const summarizer = new ClusterSummarizer({
        model: pipelineConfig.summarization?.model,
        apiKey: this.ctx.config.ai.apiKey,
        apiBase: this.ctx.config.ai.apiBase,
        language: this.ctx.config.aiAnalysis.language,
      });

      const summaries = await summarizer.summarizeBatch(topClusters);
      logger.info(`[Pipeline] Generated ${summaries.length} summaries`);

      // Save summaries to Convex
      if (convex) {
        try {
          for (let si = 0; si < summaries.length; si++) {
            const convexClusterId = clusterConvexIds.get(si);
            if (convexClusterId) {
              await convex.mutation(convexApi.clusters.saveSummary, {
                clusterId: convexClusterId,
                headline: summaries[si].headline,
                summary: summaries[si].summary,
                keyPoints: summaries[si].keyPoints,
                perspectives: summaries[si].perspectives ?? [],
                importance: summaries[si].importance,
                language: this.ctx.config.aiAnalysis.language,
                model: pipelineConfig.summarization?.model,
              });
            }
          }
          logger.info(`[Convex] Saved ${summaries.length} summaries`);
        } catch (err) {
          logger.warn({ err }, "[Convex] Failed to save summaries, continuing");
        }
      }

      // Step 9: Map to report topics
      const topics: ClusterReportTopic[] = summaries.map((summary, i) => {
        const scored = topClusters[i];
        // Collect source URLs from the cluster articles
        const allArticles = [scored.primary, ...scored.related];
        const urls: Array<{ name: string; url: string }> = [];
        const seenUrls = new Set<string>();
        for (const article of allArticles) {
          if (article.url && !seenUrls.has(article.url)) {
            seenUrls.add(article.url);
            // Look up feed name from the RssItem
            const rssItem = dedupedItems.find((r) => r.url === article.url);
            urls.push({
              name: rssItem?.feedName || article.source,
              url: article.url,
            });
          }
        }

        return {
          headline: summary.headline,
          summary: summary.summary,
          keyPoints: summary.keyPoints,
          urls: urls.slice(0, 8),
          distinctSources: scored.distinctSources,
          totalMentions: scored.totalMentions,
          score: scored.score,
        };
      });

      // Complete pipeline run in Convex
      if (convex && convexRunId) {
        try {
          await convex.mutation(convexApi.pipeline.completeRun, {
            runId: convexRunId,
            completedAt: new Date().toISOString(),
            clusterCount: clusters.length,
            topicCount: topics.length,
          });
        } catch (_) {
          /* best effort */
        }
      }

      logger.info(
        `[Pipeline] Complete: ${topics.length} topics from ${rssItems.length} items`,
      );

      return {
        topics,
        clusters: scoredClusters,
        summaries,
        totalItems: rssItems.length,
        dedupedItems: dedupedItems.length,
        clusterCount: clusters.length,
      };
    } catch (error) {
      logger.error({ error }, "[Pipeline] AI pipeline failed");
      return null;
    }
  }

  /**
   * Main run method
   */
  async run(): Promise<void> {
    try {
      const now = this.ctx.getTime();
      logger.info(`Current time: ${now.toISOString()}`);
      logger.info(`Report mode: ${this.ctx.reportMode}`);

      // Crawl RSS data
      const { rssItems } = await this.crawlRssData();

      if (rssItems && rssItems.length > 0) {
        logger.info(`[RSS] Total items: ${rssItems.length}`);
      }

      const pipelineEnabled = this.ctx.config.aiPipeline?.enabled;
      let pipelineResult: AIPipelineResult | null = null;

      if (pipelineEnabled && rssItems && rssItems.length > 0) {
        pipelineResult = await this.runAIPipeline(rssItems);
      }

      if (pipelineResult && pipelineResult.topics.length > 0) {
        const reportContent = renderClusterReport(pipelineResult.topics, {
          reportType: "TrendRadar Daily Digest",
          getTime: () => this.ctx.getTime(),
        });

        // Send notification
        if (this.isDryRun) {
          logger.info("[Dry-run] Skipping notifications");
        } else {
          const dispatcher = new NotificationDispatcher({
            config: this.ctx.config,
            getTime: () => this.ctx.getTime(),
          });

          if (dispatcher.hasChannelConfigured()) {
            logger.info("[Notify] Sending cluster report...");
            const results = await dispatcher.dispatchClusterReport({
              topics: pipelineResult.topics,
              reportType: "TrendRadar Daily Digest",
            });

            for (const [channel, result] of Object.entries(results)) {
              if (result.success) {
                logger.info(`[Notify] ${channel}: sent successfully`);
              } else {
                logger.error(`[Notify] ${channel}: failed - ${result.error}`);
              }
            }
          }
        }

        // Save HTML report
        const storage = this.ctx.getStorageManager();
        const dateStr = now.toISOString().split("T")[0];
        await storage.saveHtmlReport(
          reportContent,
          `${dateStr}-digest.html`,
          true,
        );

        logger.info("AI pipeline analysis complete");
      }
    } catch (error) {
      logger.error({ error }, "Analysis pipeline error");
      throw error;
    } finally {
      await this.ctx.cleanup();
    }
  }
}
