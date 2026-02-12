import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  /**
   * Deduplicated articles with cached embeddings.
   * Keyed by URL so re-embedding is skipped for known articles.
   */
  articles: defineTable({
    url: v.string(),
    title: v.string(),
    content: v.optional(v.string()),
    feedId: v.string(),
    feedName: v.optional(v.string()),
    publishedAt: v.optional(v.string()),
    firstSeenAt: v.string(),
    lastSeenAt: v.string(),
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
  })
    .index('by_url', ['url'])
    .index('by_feedId', ['feedId'])
    .index('by_lastSeenAt', ['lastSeenAt'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['feedId'],
    }),

  /**
   * Tracks each pipeline execution for auditability.
   */
  pipelineRuns: defineTable({
    date: v.string(),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    totalItems: v.number(),
    dedupedItems: v.number(),
    clusterCount: v.optional(v.number()),
    topicCount: v.optional(v.number()),
    embeddingModel: v.optional(v.string()),
    summaryModel: v.optional(v.string()),
    clusterThreshold: v.optional(v.number()),
  }).index('by_date', ['date']),

  /**
   * One row per cluster per pipeline run. Stores scoring output.
   */
  clusters: defineTable({
    runId: v.id('pipelineRuns'),
    label: v.optional(v.string()),
    primaryArticleId: v.id('articles'),
    memberCount: v.number(),
    score: v.number(),
    distinctSources: v.number(),
    totalMentions: v.number(),
  })
    .index('by_runId', ['runId'])
    .index('by_score', ['score']),

  /**
   * Links articles to clusters (M:N).
   */
  clusterMembers: defineTable({
    clusterId: v.id('clusters'),
    articleId: v.id('articles'),
    isPrimary: v.boolean(),
  })
    .index('by_clusterId', ['clusterId'])
    .index('by_articleId', ['articleId']),

  /**
   * LLM-generated summaries, separated so they can be regenerated independently.
   */
  clusterSummaries: defineTable({
    clusterId: v.id('clusters'),
    headline: v.string(),
    summary: v.string(),
    keyPoints: v.array(v.string()),
    perspectives: v.array(v.string()),
    importance: v.optional(v.number()),
    language: v.optional(v.string()),
    model: v.optional(v.string()),
    createdAt: v.string(),
  }).index('by_clusterId', ['clusterId']),
});
