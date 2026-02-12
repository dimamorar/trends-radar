import type { ChatMessage } from '../client';
import { logger } from '../../utils/logger';
import type { AIAnalysisResult } from './analyzer';
import { parseResponse } from './parsing';

export interface TextAnalysisParams {
  newsContent: string;
  rssContent: string;
  hotlistCount: number;
  rssCount: number;
  analyzedCount: number;
  totalNews: number;
  reportMode: string;
  reportType: string;
  keywords: string[];
}

export interface TextAnalysisDeps {
  client: {
    chat: (messages: ChatMessage[]) => Promise<string>;
  };
  systemPrompt: string;
  userPromptTemplate: string;
  language: string;
  maxNews: number;
  includeRss: boolean;
  getTime: () => Date;
}

export async function analyzeWithTextParsing(
  params: TextAnalysisParams,
  deps: TextAnalysisDeps,
): Promise<AIAnalysisResult> {
  const {
    newsContent,
    rssContent,
    hotlistCount,
    rssCount,
    analyzedCount,
    totalNews,
    reportMode,
    reportType,
    keywords,
  } = params;

  const {
    client,
    systemPrompt,
    userPromptTemplate,
    language,
    maxNews,
    includeRss,
    getTime,
  } = deps;

  const currentTime = getTime().toISOString();

  const userPrompt = userPromptTemplate
    .replace('{report_mode}', reportMode)
    .replace('{report_type}', reportType)
    .replace('{current_time}', currentTime)
    .replace('{news_count}', String(hotlistCount))
    .replace('{rss_count}', String(rssCount))
    .replace('{keywords}', keywords.slice(0, 20).join(', ') || 'None')
    .replace('{news_content}', newsContent)
    .replace('{rss_content}', rssContent)
    .replace('{language}', language);

  try {
    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    logger.info(`[AI] Calling AI model for analysis (${analyzedCount} items)...`);
    const response = await client.chat(messages);

    const result = parseResponse(response);

    if (!includeRss) {
      result.rssInsights = '';
    }

    result.totalNews = totalNews;
    result.hotlistCount = hotlistCount;
    result.rssCount = rssCount;
    result.analyzedNews = analyzedCount;
    result.maxNewsLimit = maxNews;

    logger.info('[AI] Analysis complete');
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error }, '[AI] Analysis failed');
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
