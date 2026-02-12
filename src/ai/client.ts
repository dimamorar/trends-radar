/**
 * AI Client
 *
 * Unified AI client using Vercel AI SDK
 * Supports OpenAI, Anthropic, Google, DeepSeek, and other providers
 */

import {
  generateText,
  streamText,
  embedMany,
  type LanguageModel,
  type EmbeddingModel,
  type ModelMessage,
  type UserModelMessage,
  type SystemModelMessage,
  type AssistantModelMessage,
} from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { logger } from '../utils/logger.js';

/**
 * AI client configuration
 */
export interface AIClientConfig {
  model: string; // e.g., "anthropic/claude-sonnet-4-20250514" or "gpt-4o"
  apiKey: string;
  apiBase?: string; // Override API base URL
  temperature?: number;
  maxTokens?: number;
  timeout?: number; // in seconds
  fallbackModels?: string[]; // Fallback models for retry
}

/**
 * Chat message format (backward compatible)
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Provider information extracted from model string
 */
interface ProviderInfo {
  provider: string;
  modelId: string;
}

/**
 * Stream callback type
 */
export type StreamCallback = (chunk: string) => void;

/**
 * Parse model string to extract provider and model ID
 * Supports formats:
 * - "provider/model" (e.g., "anthropic/claude-sonnet-4-20250514")
 * - "model" (defaults to openai, e.g., "gpt-4o")
 */
function parseModelString(model: string): ProviderInfo {
  if (model.includes('/')) {
    const [provider, ...rest] = model.split('/');
    return {
      provider: provider.toLowerCase(),
      modelId: rest.join('/'),
    };
  }
  return {
    provider: 'openai',
    modelId: model,
  };
}

/**
 * Create an embedding model instance for the given provider and model
 */
function createEmbeddingModelInstance(
  providerInfo: ProviderInfo,
  apiKey: string,
  apiBase?: string,
): EmbeddingModel {
  const { provider, modelId } = providerInfo;

  const openai = createOpenAI({
    apiKey,
    ...(apiBase && { baseURL: apiBase }),
    ...(!apiBase && getDefaultBaseUrl(provider) && { baseURL: getDefaultBaseUrl(provider) }),
  });
  return openai.embedding(modelId);
}

/**
 * Create a language model instance for the given provider and model
 */
function createLanguageModel(
  providerInfo: ProviderInfo,
  apiKey: string,
  apiBase?: string,
): LanguageModel {
  const { provider, modelId } = providerInfo;

  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey,
        ...(apiBase && { baseURL: apiBase }),
      });
      return anthropic(modelId);
    }
    case 'google':
    case 'gemini': {
      const google = createGoogleGenerativeAI({
        apiKey,
        ...(apiBase && { baseURL: apiBase }),
      });
      return google(modelId);
    }
    case 'deepseek': {
      const deepseek = createDeepSeek({
        apiKey,
        ...(apiBase && { baseURL: apiBase }),
      });
      return deepseek(modelId);
    }
    default: {
      const openai = createOpenAI({
        apiKey,
        ...(apiBase && { baseURL: apiBase }),
        ...(!apiBase && getDefaultBaseUrl(provider) && { baseURL: getDefaultBaseUrl(provider) }),
      });
      return openai(modelId);
    }
  }
}

/**
 * Get default base URL for provider
 */
function getDefaultBaseUrl(provider: string): string | undefined {
  const baseUrls: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1',
    together: 'https://api.together.xyz/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    fireworks: 'https://api.fireworks.ai/inference/v1',
    perplexity: 'https://api.perplexity.ai',
  };
  return baseUrls[provider];
}

/**
 * Convert ChatMessage to ModelMessage
 */
function toModelMessage(msg: ChatMessage): ModelMessage {
  switch (msg.role) {
    case 'system':
      return { role: 'system', content: msg.content } as SystemModelMessage;
    case 'user':
      return { role: 'user', content: msg.content } as UserModelMessage;
    case 'assistant':
      return { role: 'assistant', content: msg.content } as AssistantModelMessage;
    default:
      return { role: 'user', content: msg.content } as UserModelMessage;
  }
}

/**
 * AI Client class using Vercel AI SDK
 */
export class AIClient {
  private model: LanguageModel;
  private modelString: string;
  private temperature: number;
  private maxTokens: number;
  private fallbackModels: string[];
  private apiKey: string;
  private apiBase?: string;

  constructor(config: AIClientConfig) {
    this.modelString = config.model;
    this.temperature = config.temperature ?? 1.0;
    this.maxTokens = config.maxTokens ?? 5000;
    this.fallbackModels = config.fallbackModels ?? [];
    this.apiKey = config.apiKey;
    this.apiBase = config.apiBase;

    const providerInfo = parseModelString(config.model);
    this.model = createLanguageModel(providerInfo, config.apiKey, config.apiBase);
  }

  /**
   * Chat completion (backward compatible)
   */
  async chat(
    messages: ChatMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<string> {
    const modelMessages: ModelMessage[] = messages.map(toModelMessage);

    const result = await this.generateWithFallback(modelMessages, {
      temperature: options.temperature ?? this.temperature,
      maxTokens: options.maxTokens ?? this.maxTokens,
    });

    return result;
  }

  /**
   * Generate text with automatic fallback to backup models
   */
  private async generateWithFallback(
    messages: ModelMessage[],
    options: { temperature: number; maxTokens: number },
  ): Promise<string> {
    const modelsToTry = [this.modelString, ...this.fallbackModels];
    let lastError: Error | null = null;

    for (const modelStr of modelsToTry) {
      try {
        const providerInfo = parseModelString(modelStr);
        const model = createLanguageModel(providerInfo, this.apiKey, this.apiBase);

        const { text } = await generateText({
          model,
          messages,
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
        });

        if (!text) {
          throw new Error('Empty response from AI');
        }

        if (modelStr !== this.modelString) {
          logger.info(`[AI] Used fallback model: ${modelStr}`);
        }

        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[AI] Model ${modelStr} failed: ${lastError.message}`);

        if (modelStr !== modelsToTry[modelsToTry.length - 1]) {
          logger.info(`[AI] Trying next fallback model...`);
        }
      }
    }

    throw lastError || new Error('All AI models failed');
  }

  /**
   * Stream chat completion
   */
  async chatStream(
    messages: ChatMessage[],
    onChunk: StreamCallback,
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<string> {
    const modelMessages: ModelMessage[] = messages.map(toModelMessage);

    const { textStream, text } = streamText({
      model: this.model,
      messages: modelMessages,
      temperature: options.temperature ?? this.temperature,
      maxOutputTokens: options.maxTokens ?? this.maxTokens,
    });

    for await (const chunk of textStream) {
      onChunk(chunk);
    }

    const fullText = await text;
    if (!fullText) {
      throw new Error('Empty response from AI');
    }

    return fullText;
  }

  /**
   * Get the underlying language model (for advanced use with AI SDK)
   */
  getModel(): LanguageModel {
    return this.model;
  }

  /**
   * Get the model string
   */
  getModelString(): string {
    return this.modelString;
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; error?: string } {
    if (!this.modelString) {
      return { valid: false, error: 'No AI model configured' };
    }

    if (!this.model) {
      return { valid: false, error: 'AI client not initialized' };
    }

    return { valid: true };
  }

  /**
   * Generate embeddings for multiple texts
   * @param texts - Array of texts to embed
   * @param embeddingModel - Model string for embeddings (e.g., "openai/text-embedding-3-small")
   * @returns Array of embedding vectors
   */
  async generateEmbeddings(texts: string[], embeddingModel?: string): Promise<number[][]> {
    const modelStr = embeddingModel ?? 'openai/text-embedding-3-small';
    const providerInfo = parseModelString(modelStr);
    const model = createEmbeddingModelInstance(providerInfo, this.apiKey, this.apiBase);

    const { embeddings } = await embedMany({
      model,
      values: texts,
    });

    return embeddings;
  }

  /**
   * Create an embedding model instance
   * @param modelString - Model string (e.g., "openai/text-embedding-3-small")
   * @returns EmbeddingModel instance
   */
  createEmbeddingModel(modelString: string): EmbeddingModel {
    const providerInfo = parseModelString(modelString);
    return createEmbeddingModelInstance(providerInfo, this.apiKey, this.apiBase);
  }
}

/**
 * Create AI client from config
 */
export function createAIClient(config: {
  model: string;
  apiKey: string;
  apiBase?: string;
  timeout?: number;
  fallbackModels?: string[];
}): AIClient {
  return new AIClient({
    model: config.model,
    apiKey: config.apiKey,
    apiBase: config.apiBase,
    timeout: config.timeout,
    fallbackModels: config.fallbackModels,
  });
}

export default AIClient;
