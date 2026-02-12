/**
 * AI Response Schemas
 *
 * Zod schemas for structured AI outputs using Vercel AI SDK
 */

import { z } from 'zod';

/**
 * Schema for the 5-section news analysis result
 */
export const AnalysisResultSchema = z.object({
  coreTrends: z
    .string()
    .describe('Main trends and public opinion patterns identified in the news'),
  sentimentControversy: z
    .string()
    .describe('Emotional direction, sentiment analysis, and controversial topics'),
  signals: z
    .string()
    .describe('Anomalies, weak signals, and emerging patterns worth watching'),
  rssInsights: z.string().describe('Deep insights specifically from RSS news sources'),
  outlookStrategy: z
    .string()
    .describe('Predictions, forecasts, and recommended actions or strategies'),
});

export type AnalysisResultOutput = z.infer<typeof AnalysisResultSchema>;

/**
 * Schema for news categorization
 */
export const NewsCategorySchema = z.object({
  category: z
    .enum([
      'politics',
      'economy',
      'military',
      'society',
      'technology',
      'culture',
      'sports',
      'other',
    ])
    .describe('Primary category of the news item'),
  subcategory: z.string().optional().describe('More specific subcategory if applicable'),
  confidence: z.number().min(0).max(1).describe('Confidence score from 0 to 1'),
  tags: z.array(z.string()).describe('Relevant tags for the news item'),
});

export type NewsCategoryOutput = z.infer<typeof NewsCategorySchema>;

/**
 * Schema for sentiment analysis
 */
export const SentimentSchema = z.object({
  sentiment: z
    .enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative'])
    .describe('Overall sentiment of the content'),
  score: z.number().min(-1).max(1).describe('Sentiment score from -1 (negative) to 1 (positive)'),
  emotions: z
    .array(
      z.object({
        emotion: z.string().describe('Detected emotion'),
        intensity: z.number().min(0).max(1).describe('Intensity of the emotion'),
      }),
    )
    .describe('Detected emotions in the content'),
  reasoning: z.string().describe('Brief explanation of the sentiment analysis'),
});

export type SentimentOutput = z.infer<typeof SentimentSchema>;

/**
 * Schema for trend detection
 */
export const TrendSchema = z.object({
  trends: z.array(
    z.object({
      name: z.string().describe('Name or title of the trend'),
      description: z.string().describe('Brief description of the trend'),
      strength: z.enum(['emerging', 'growing', 'peak', 'declining']).describe('Trend strength'),
      relatedKeywords: z.array(z.string()).describe('Related keywords'),
      newsCount: z.number().describe('Number of news items related to this trend'),
    }),
  ),
  emergingTopics: z.array(z.string()).describe('Topics that are just starting to appear'),
  fadingTopics: z.array(z.string()).describe('Topics that are losing attention'),
});

export type TrendOutput = z.infer<typeof TrendSchema>;

/**
 * Schema for article classification (used by AIClassifier)
 */
export const ArticleClassificationSchema = z.object({
  category: z
    .enum([
      'politics',
      'economy',
      'military',
      'technology',
      'society',
      'culture',
      'sports',
      'breaking',
      'other',
    ])
    .describe('Primary category of the article'),
  subcategory: z.string().optional().describe('More specific subcategory if applicable'),
  entities: z
    .array(
      z.object({
        name: z.string().describe('Name of the entity'),
        type: z
          .enum(['person', 'organization', 'location', 'event', 'product'])
          .describe('Type of the entity'),
      }),
    )
    .describe('Named entities mentioned in the article'),
  keyClaims: z
    .array(z.string())
    .max(5)
    .describe('Key claims or facts stated in the article (max 5)'),
  importance: z
    .number()
    .min(0)
    .max(1)
    .describe('Importance score from 0 to 1 based on impact and relevance'),
  sentiment: z
    .enum(['positive', 'neutral', 'negative'])
    .describe('Overall sentiment of the article'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score for the classification'),
});

export type ArticleClassificationOutput = z.infer<typeof ArticleClassificationSchema>;

/**
 * Schema for cluster summary (used by ClusterSummarizer)
 */
export const ClusterSummarySchema = z.object({
  headline: z.string().max(100).describe('Concise headline summarizing the cluster (max 100 chars)'),
  summary: z.string().describe('Comprehensive summary of the news cluster'),
  keyPoints: z
    .array(z.string())
    .max(5)
    .describe('Key points from the clustered articles (max 5)'),
  perspectives: z
    .array(z.string())
    .max(3)
    .describe('Different perspectives or viewpoints from sources (max 3)'),
  importance: z
    .number()
    .min(0)
    .max(1)
    .describe('Overall importance score for the cluster'),
});

export type ClusterSummaryOutput = z.infer<typeof ClusterSummarySchema>;
