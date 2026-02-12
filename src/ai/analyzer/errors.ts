import type { AIAnalysisResult } from './analyzer';

export function createErrorResult(error: string): AIAnalysisResult {
  return {
    coreTrends: '',
    sentimentControversy: '',
    signals: '',
    rssInsights: '',
    outlookStrategy: '',
    rawResponse: '',
    success: false,
    error,
    totalNews: 0,
    analyzedNews: 0,
    maxNewsLimit: 0,
    hotlistCount: 0,
    rssCount: 0,
  };
}
