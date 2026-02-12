import {
  generateText,
  type LanguageModel,
  type SystemModelMessage,
  type UserModelMessage,
} from 'ai';
import { logger } from '../../utils/logger';
import { AnalysisResultSchema, type AnalysisResultOutput } from '../schemas';
import type { AIAnalysisResult } from './analyzer';
import { parseResponseToResult } from './parsing';
import { getStructuredOutputPrompt } from './prompt';

export interface StructuredAnalysisParams {
  newsContent: string;
  rssContent: string;
  hotlistCount: number;
  rssCount: number;
  analyzedCount: number;
  totalNews: number;
}

export interface StructuredAnalysisDeps {
  client: {
    getModel: () => LanguageModel;
  };
  language: string;
  includeRss: boolean;
  maxNews: number;
  getTime: () => Date;
}

export async function analyzeWithStructuredOutput(
  params: StructuredAnalysisParams,
  deps: StructuredAnalysisDeps,
): Promise<AIAnalysisResult> {
  const {
    newsContent,
    rssContent,
    hotlistCount,
    rssCount,
    analyzedCount,
    totalNews,
  } = params;

  const { client, language, includeRss, maxNews, getTime } = deps;

  try {
    const systemPrompt = getStructuredOutputPrompt().replace(
      '{language}',
      language,
    );

    const userContent = `Analyze these news items:\n\nNews (${hotlistCount} items):\n${newsContent || 'None'}\n\nRSS (${rssCount} items):\n${rssContent || 'None'}\n\nTime: ${getTime().toISOString()}`;

    logger.info(
      `[AI] Calling AI model with structured output (${analyzedCount} items)...`,
    );

    const { text } = await generateText({
      model: client.getModel(),
      messages: [
        { role: 'system', content: systemPrompt } as SystemModelMessage,
        { role: 'user', content: userContent } as UserModelMessage,
      ],
    });

    let result: AnalysisResultOutput;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = AnalysisResultSchema.parse(JSON.parse(jsonMatch[0]));
      } else {
        throw new Error('No JSON found in response');
      }
    } catch {
      logger.warn(
        '[AI] Structured output parsing failed, falling back to text parsing',
      );
      return parseResponseToResult(
        text,
        totalNews,
        hotlistCount,
        rssCount,
        analyzedCount,
        maxNews,
        includeRss,
      );
    }

    let rssInsights = result.rssInsights;
    if (!includeRss) {
      rssInsights = '';
    }

    logger.info('[AI] Structured analysis complete');

    return {
      coreTrends: result.coreTrends,
      sentimentControversy: result.sentimentControversy,
      signals: result.signals,
      rssInsights,
      outlookStrategy: result.outlookStrategy,
      rawResponse: JSON.stringify(result, null, 2),
      success: true,
      totalNews,
      hotlistCount,
      rssCount,
      analyzedNews: analyzedCount,
      maxNewsLimit: maxNews,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error }, '[AI] Structured analysis failed');
    return {
      coreTrends: '',
      sentimentControversy: '',
      signals: '',
      rssInsights: '',
      outlookStrategy: '',
      rawResponse: '',
      success: false,
      error: errorMsg,
      totalNews,
      hotlistCount,
      rssCount,
      analyzedNews: 0,
      maxNewsLimit: maxNews,
    };
  }
}
