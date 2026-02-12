/**
 * AI Article Classifier
 *
 * Classify news articles using fast model (Haiku) with structured output
 */

// Phase 2: Can be integrated into pipeline for per-article classification
// Currently skipped in MVP pipeline (stub values used instead)

import { generateObject, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import {
  ArticleClassificationSchema,
  type ArticleClassificationOutput,
} from "./schemas";
import { logger } from "../utils/logger";

/**
 * Input for article classification
 */
export interface ClassificationInput {
  id: string;
  title: string;
  content?: string;
  source: string;
}

/**
 * Result of article classification
 */
export interface ClassificationResult {
  id: string;
  category: string;
  subcategory?: string;
  entities: Array<{ name: string; type: string }>;
  keyClaims: string[];
  importance: number;
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
}

/**
 * Classifier configuration
 */
export interface AIClassifierConfig {
  model: string; // e.g., "anthropic/claude-haiku-4-5-20251001"
  apiKey: string;
  apiBase?: string;
  batchSize?: number;
  concurrency?: number;
}

/**
 * Parse model string to extract provider and model ID
 */
function parseModelString(model: string): {
  provider: string;
  modelId: string;
} {
  if (model.includes("/")) {
    const [provider, ...rest] = model.split("/");
    return {
      provider: provider.toLowerCase(),
      modelId: rest.join("/"),
    };
  }
  return {
    provider: "openai",
    modelId: model,
  };
}

/**
 * Create a language model instance for classification
 */
function createLanguageModel(
  provider: string,
  modelId: string,
  apiKey: string,
  apiBase?: string,
): LanguageModel {
  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey,
        ...(apiBase && { baseURL: apiBase }),
      });
      return anthropic(modelId);
    }
    default: {
      const openai = createOpenAI({
        apiKey,
        ...(apiBase && { baseURL: apiBase }),
      });
      return openai(modelId);
    }
  }
}

/**
 * AI-powered article classifier
 */
export class AIClassifier {
  private model: LanguageModel;
  private modelString: string;
  private batchSize: number;
  private concurrency: number;

  constructor(config: AIClassifierConfig) {
    this.modelString = config.model;
    this.batchSize = config.batchSize ?? 10;
    this.concurrency = config.concurrency ?? 3;

    const { provider, modelId } = parseModelString(config.model);
    this.model = createLanguageModel(
      provider,
      modelId,
      config.apiKey,
      config.apiBase,
    );
  }

  /**
   * Build prompt for article classification
   */
  private buildPrompt(item: ClassificationInput): string {
    const parts = [
      `Classify the following news article:`,
      ``,
      `Title: ${item.title}`,
      `Source: ${item.source}`,
    ];

    if (item.content) {
      parts.push(``, `Content: ${item.content}`);
    }

    parts.push(
      ``,
      `Provide a structured classification including:`,
      `- Primary category (politics, economy, military, technology, society, culture, sports, breaking, other)`,
      `- Named entities mentioned (people, organizations, locations, events, products)`,
      `- Key claims or facts (max 5)`,
      `- Importance score (0-1 based on impact and relevance)`,
      `- Overall sentiment (positive, neutral, negative)`,
      `- Confidence score for the classification (0-1)`,
    );

    return parts.join("\n");
  }

  /**
   * Classify a single article
   * @param item - Article to classify
   * @returns Classification result
   */
  async classify(item: ClassificationInput): Promise<ClassificationResult> {
    const prompt = this.buildPrompt(item);

    const { object } = await generateObject({
      model: this.model,
      schema: ArticleClassificationSchema,
      prompt,
    });

    const classification = object as ArticleClassificationOutput;

    return {
      id: item.id,
      category: classification.category,
      subcategory: classification.subcategory,
      entities: classification.entities,
      keyClaims: classification.keyClaims,
      importance: classification.importance,
      sentiment: classification.sentiment,
      confidence: classification.confidence,
    };
  }

  /**
   * Classify multiple articles with concurrency control
   * @param items - Articles to classify
   * @returns Array of classification results
   */
  async classifyBatch(
    items: ClassificationInput[],
  ): Promise<ClassificationResult[]> {
    if (items.length === 0) {
      return [];
    }

    logger.info(
      `[Classifier] Classifying ${items.length} articles with concurrency ${this.concurrency}`,
    );

    const results: ClassificationResult[] = [];
    const errors: Array<{ id: string; error: Error }> = [];

    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);

      const batchPromises = batch.map(async (item) => {
        try {
          return await this.classify(item);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.warn(
            `[Classifier] Failed to classify article ${item.id}: ${err.message}`,
          );
          errors.push({ id: item.id, error: err });
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result !== null) {
          results.push(result);
        }
      }
    }

    if (errors.length > 0) {
      logger.warn(
        `[Classifier] ${errors.length} articles failed classification`,
      );
    }

    logger.info(
      `[Classifier] Successfully classified ${results.length}/${items.length} articles`,
    );
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
 * Create an AI classifier from config
 */
export function createAIClassifier(config: AIClassifierConfig): AIClassifier {
  return new AIClassifier(config);
}
