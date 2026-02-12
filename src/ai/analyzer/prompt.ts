import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../../utils/logger';

export interface PromptTemplate {
  systemPrompt: string;
  userPrompt: string;
}

export function loadPromptTemplate(promptFile?: string): PromptTemplate {
  const defaultPrompt = getDefaultPrompt();

  if (!promptFile) {
    return defaultPrompt;
  }

  const configDir = join(process.cwd(), 'config');
  const promptPath = join(configDir, promptFile);

  if (!existsSync(promptPath)) {
    logger.warn(`Prompt file not found: ${promptPath}, using default`);
    return defaultPrompt;
  }

  try {
    const content = readFileSync(promptPath, 'utf-8');

    if (content.includes('[system]') && content.includes('[user]')) {
      const parts = content.split('[user]');
      const systemPart = parts[0];
      const userPart = parts[1] || '';

      let systemPrompt = '';
      if (systemPart.includes('[system]')) {
        systemPrompt = systemPart.split('[system]')[1].trim();
      }

      return {
        systemPrompt,
        userPrompt: userPart.trim(),
      };
    }

    return {
      systemPrompt: '',
      userPrompt: content,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to load prompt file');
    return defaultPrompt;
  }
}

export function getDefaultPrompt(): PromptTemplate {
  return {
    systemPrompt: `You are a news analyst specializing in trend analysis and public opinion research.
Analyze the provided news data and generate insights in a structured format.`,
    userPrompt: `Please analyze the following news data and provide insights.

Report Type: {report_type}
Time: {current_time}
Language: {language}

News Content ({news_count} items):
{news_content}

RSS Content ({rss_count} items):
{rss_content}

Please provide analysis in the following 5 sections:

## 1. Core Trends
Main trends and public opinion patterns.

## 2. Sentiment & Controversy
Emotional direction and controversial topics.

## 3. Signals
Anomalies and weak signals worth watching.

## 4. RSS Insights
Deep insights from RSS sources.

## 5. Outlook & Strategy
Predictions and recommended actions.`,
  };
}

export function getStructuredOutputPrompt(): string {
  return `You are a news analyst. Analyze the provided news and return a JSON object with these exact fields:

- coreTrends: Main trends and public opinion patterns (2-3 paragraphs)
- sentimentControversy: Emotional direction and controversial topics (2-3 paragraphs)
- signals: Anomalies and weak signals worth watching (2-3 paragraphs)
- rssInsights: Deep insights from RSS sources (2-3 paragraphs)
- outlookStrategy: Predictions and recommended actions (2-3 paragraphs)

Be thorough and analytical. Write in {language}.`;
}
