/**
 * AI Analyzer
 *
 * Performs AI-powered analysis of news content using Vercel AI SDK
 * Supports 5-section analysis framework with structured output
 */

import {
  streamText,
  type ModelMessage,
  type SystemModelMessage,
  type UserModelMessage,
} from "ai";
import type { RssItem, StatisticsEntry } from "../../types/index";
import { logger } from "../../utils/logger";
import { AIClient, type StreamCallback } from "../client";
import { prepareNewsContent } from "./content";
import { createErrorResult } from "./errors";
import { parseResponse } from "./parsing";
import { analyzeWithStructuredOutput } from "./structured";
import { analyzeWithTextParsing } from "./text";
import { loadPromptTemplate } from "./prompt";

/**
 * AI Analysis Result
 */
export interface AIAnalysisResult {
  coreTrends: string;
  sentimentControversy: string;
  signals: string;
  rssInsights: string;
  outlookStrategy: string;
  rawResponse: string;
  success: boolean;
  error?: string;
  totalNews: number;
  analyzedNews: number;
  maxNewsLimit: number;
  hotlistCount: number;
  rssCount: number;
}

/**
 * AI Analyzer configuration
 */
export interface AIAnalyzerConfig {
  model: string;
  apiKey: string;
  apiBase?: string;
  timeout?: number;
  language?: string;
  promptFile?: string;
  maxNews?: number;
  includeRss?: boolean;
  fallbackModels?: string[];
  useStructuredOutput?: boolean;
}

/**
 * AI Analyzer class
 */
export class AIAnalyzer {
  private client: AIClient;
  private language: string;
  private maxNews: number;
  private includeRss: boolean;
  private systemPrompt: string;
  private userPromptTemplate: string;
  private getTime: () => Date;
  private useStructuredOutput: boolean;

  constructor(config: AIAnalyzerConfig, getTime: () => Date) {
    this.client = new AIClient({
      model: config.model,
      apiKey: config.apiKey,
      apiBase: config.apiBase,
      timeout: config.timeout ?? 120,
      fallbackModels: config.fallbackModels,
    });

    this.language = config.language ?? "Ukrainian";
    this.maxNews = config.maxNews ?? 50;
    this.includeRss = config.includeRss ?? true;
    this.getTime = getTime;
    this.useStructuredOutput = config.useStructuredOutput ?? false;

    const { systemPrompt, userPrompt } = loadPromptTemplate(config.promptFile);
    this.systemPrompt = systemPrompt;
    this.userPromptTemplate = userPrompt;
  }

  /**
   * Analyze news data
   */
  async analyze(options: {
    stats: StatisticsEntry[];
    rssItems?: RssItem[] | null;
    reportMode?: string;
    reportType?: string;
    keywords?: string[];
  }): Promise<AIAnalysisResult> {
    const {
      stats,
      rssItems,
      reportMode = "daily",
      reportType = "Daily Summary",
      keywords = [],
    } = options;

    const validation = this.client.validateConfig();
    if (!validation.valid) {
      return createErrorResult(validation.error || "Invalid AI configuration");
    }

    const { newsContent, rssContent, hotlistCount, rssCount, analyzedCount } =
      prepareNewsContent(stats, rssItems, this.maxNews, this.includeRss);

    const totalNews = hotlistCount + rssCount;

    if (!newsContent && !rssContent) {
      return {
        ...createErrorResult("No news content to analyze"),
        totalNews,
        hotlistCount,
        rssCount,
        analyzedNews: 0,
        maxNewsLimit: this.maxNews,
      };
    }

    if (this.useStructuredOutput) {
      return analyzeWithStructuredOutput(
        {
          newsContent,
          rssContent,
          hotlistCount,
          rssCount,
          analyzedCount,
          totalNews,
        },
        {
          client: this.client,
          language: this.language,
          includeRss: this.includeRss,
          maxNews: this.maxNews,
          getTime: this.getTime,
        }
      );
    }

    return analyzeWithTextParsing(
      {
        newsContent,
        rssContent,
        hotlistCount,
        rssCount,
        analyzedCount,
        totalNews,
        reportMode,
        reportType,
        keywords:
          keywords.length > 0
            ? keywords
            : stats.map((s) => s.word).filter(Boolean),
      },
      {
        client: this.client,
        systemPrompt: this.systemPrompt,
        userPromptTemplate: this.userPromptTemplate,
        language: this.language,
        maxNews: this.maxNews,
        includeRss: this.includeRss,
        getTime: this.getTime,
      }
    );
  }

  /**
   * Analyze with streaming (for real-time progress)
   */
  async analyzeStream(
    options: {
      stats: StatisticsEntry[];
      rssItems?: RssItem[] | null;
      reportMode?: string;
      reportType?: string;
      keywords?: string[];
    },
    onChunk: StreamCallback
  ): Promise<AIAnalysisResult> {
    const {
      stats,
      rssItems,
      reportMode = "daily",
      reportType = "Daily Summary",
      keywords = [],
    } = options;

    const validation = this.client.validateConfig();
    if (!validation.valid) {
      return createErrorResult(validation.error || "Invalid AI configuration");
    }

    const { newsContent, rssContent, hotlistCount, rssCount, analyzedCount } =
      prepareNewsContent(stats, rssItems, this.maxNews, this.includeRss);

    const totalNews = hotlistCount + rssCount;

    if (!newsContent && !rssContent) {
      return {
        ...createErrorResult("No news content to analyze"),
        totalNews,
        hotlistCount,
        rssCount,
        analyzedNews: 0,
        maxNewsLimit: this.maxNews,
      };
    }

    const currentTime = this.getTime().toISOString();
    const extractedKeywords =
      keywords.length > 0 ? keywords : stats.map((s) => s.word).filter(Boolean);

    const userPrompt = this.userPromptTemplate
      .replace("{report_mode}", reportMode)
      .replace("{report_type}", reportType)
      .replace("{current_time}", currentTime)
      .replace("{news_count}", String(hotlistCount))
      .replace("{rss_count}", String(rssCount))
      .replace(
        "{keywords}",
        extractedKeywords.slice(0, 20).join(", ") || "None"
      )
      .replace("{news_content}", newsContent)
      .replace("{rss_content}", rssContent)
      .replace("{language}", this.language);

    try {
      const messages: ModelMessage[] = [];

      if (this.systemPrompt) {
        messages.push({
          role: "system",
          content: this.systemPrompt,
        } as SystemModelMessage);
      }
      messages.push({ role: "user", content: userPrompt } as UserModelMessage);

      logger.info(`[AI] Streaming analysis (${analyzedCount} items)...`);

      const { textStream, text } = streamText({
        model: this.client.getModel(),
        messages,
      });

      for await (const chunk of textStream) {
        onChunk(chunk);
      }

      const response = await text;

      const result = parseResponse(response);

      if (!this.includeRss) {
        result.rssInsights = "";
      }

      result.totalNews = totalNews;
      result.hotlistCount = hotlistCount;
      result.rssCount = rssCount;
      result.analyzedNews = analyzedCount;
      result.maxNewsLimit = this.maxNews;

      logger.info("[AI] Streaming analysis complete");
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error }, "[AI] Streaming analysis failed");
      return {
        ...createErrorResult(errorMsg),
        totalNews,
        hotlistCount,
        rssCount,
        analyzedNews: 0,
        maxNewsLimit: this.maxNews,
      };
    }
  }
}

export default AIAnalyzer;
