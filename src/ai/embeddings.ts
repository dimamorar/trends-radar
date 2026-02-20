/**
 * Embedding Service
 *
 * Generate embeddings using AI SDK and compute similarity for deduplication
 */

// Integrated into NewsAnalyzer.runAIPipeline() pipeline
// TODO: Add caching for embeddings to reduce API costs

import { embedMany, type EmbeddingModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Embedding service configuration
 */
export interface EmbeddingServiceConfig {
  model: string; // e.g., "openai/text-embedding-3-small"
  apiKey: string;
  apiBase?: string;
}

/** Parse model string to OpenAI model ID (supports "openai/model" or "model"). */
function parseModelString(model: string): string {
  if (model.includes("/")) {
    const [, ...rest] = model.split("/");
    return rest.join("/");
  }
  return model;
}

/**
 * Create an embedding model instance
 */
function createEmbeddingModelInstance(
  modelId: string,
  apiKey: string,
  apiBase?: string,
): EmbeddingModel {
  // Currently only OpenAI embedding models are supported
  const openai = createOpenAI({
    apiKey,
    ...(apiBase && { baseURL: apiBase }),
  });
  return openai.embedding(modelId);
}

/**
 * Service for generating text embeddings and computing similarity
 */
export class EmbeddingService {
  private model: EmbeddingModel;
  private modelString: string;

  constructor(config: EmbeddingServiceConfig) {
    this.modelString = config.model;
    const modelId = parseModelString(config.model);
    this.model = createEmbeddingModelInstance(
      modelId,
      config.apiKey,
      config.apiBase,
    );
  }

  /**
   * Generate embedding for a single text
   * @param text - Text to embed
   * @returns Embedding vector
   */
  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  /**
   * Generate embeddings for multiple texts
   * @param texts - Array of texts to embed
   * @returns Array of embedding vectors
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Truncate texts to stay within model token limits (~8k tokens ≈ 6000 chars safe cutoff)
    const MAX_CHARS = 6000;
    const truncated = texts.map((t) =>
      t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) : t,
    );

    const { embeddings } = await embedMany({
      model: this.model,
      values: truncated,
    });

    return embeddings;
  }

  /**
   * Compute cosine similarity between two embedding vectors
   * @param a - First embedding vector
   * @param b - Second embedding vector
   * @returns Similarity score between -1 and 1
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
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
   * Find indices of similar embeddings in a corpus
   * @param embedding - Query embedding vector
   * @param corpus - Array of embedding vectors to search
   * @param threshold - Minimum similarity score (default 0.85)
   * @returns Array of indices with similarity >= threshold
   */
  findSimilar(
    embedding: number[],
    corpus: number[][],
    threshold = 0.85,
  ): number[] {
    const similarIndices: number[] = [];

    for (let i = 0; i < corpus.length; i++) {
      const similarity = this.cosineSimilarity(embedding, corpus[i]);
      if (similarity >= threshold) {
        similarIndices.push(i);
      }
    }

    return similarIndices;
  }

  /**
   * Compute similarity matrix for all pairs in a corpus
   * @param embeddings - Array of embedding vectors
   * @returns 2D array of similarity scores
   */
  computeSimilarityMatrix(embeddings: number[][]): number[][] {
    const n = embeddings.length;
    const matrix: number[][] = Array.from({ length: n }, () =>
      Array(n).fill(0),
    );

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const similarity = this.cosineSimilarity(embeddings[i], embeddings[j]);
        matrix[i][j] = similarity;
        matrix[j][i] = similarity;
      }
    }

    return matrix;
  }

  /**
   * Get the model string
   */
  getModelString(): string {
    return this.modelString;
  }
}

/**
 * Create an embedding service from config
 */
export function createEmbeddingService(
  config: EmbeddingServiceConfig,
): EmbeddingService {
  return new EmbeddingService(config);
}
