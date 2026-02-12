import type { AIAnalysisResult } from './analyzer';

export function parseResponse(response: string): AIAnalysisResult {
  const result: AIAnalysisResult = {
    coreTrends: '',
    sentimentControversy: '',
    signals: '',
    rssInsights: '',
    outlookStrategy: '',
    rawResponse: response,
    success: true,
    totalNews: 0,
    analyzedNews: 0,
    maxNewsLimit: 0,
    hotlistCount: 0,
    rssCount: 0,
  };

  const sections: Record<string, keyof AIAnalysisResult> = {
    'core trends': 'coreTrends',
    sentiment: 'sentimentControversy',
    controversy: 'sentimentControversy',
    signals: 'signals',
    rss: 'rssInsights',
    outlook: 'outlookStrategy',
    strategy: 'outlookStrategy',
  };

  const lines = response.split('\n');
  let currentSection: keyof AIAnalysisResult | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    let foundSection: keyof AIAnalysisResult | null = null;
    for (const [keyword, section] of Object.entries(sections)) {
      if (
        lowerLine.includes(keyword) &&
        (lowerLine.startsWith('#') || lowerLine.includes('**'))
      ) {
        foundSection = section;
        break;
      }
    }

    if (foundSection) {
      if (currentSection && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (typeof result[currentSection] === 'string') {
          (result[currentSection] as string) = content;
        }
      }
      currentSection = foundSection;
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection && currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    if (typeof result[currentSection] === 'string') {
      (result[currentSection] as string) = content;
    }
  }

  return result;
}

export function parseResponseToResult(
  response: string,
  totalNews: number,
  hotlistCount: number,
  rssCount: number,
  analyzedCount: number,
  maxNewsLimit: number,
  includeRss: boolean,
): AIAnalysisResult {
  const result = parseResponse(response);
  result.totalNews = totalNews;
  result.hotlistCount = hotlistCount;
  result.rssCount = rssCount;
  result.analyzedNews = analyzedCount;
  result.maxNewsLimit = maxNewsLimit;

  if (!includeRss) {
    result.rssInsights = '';
  }

  return result;
}
