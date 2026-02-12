/**
 * Cluster storage and queries
 *
 * Save cluster results, summaries, and provide historical query capabilities.
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

/**
 * Save a single cluster with its member articles.
 * Returns the cluster document ID.
 */
export const saveCluster = mutation({
  args: {
    runId: v.id('pipelineRuns'),
    label: v.optional(v.string()),
    primaryArticleId: v.id('articles'),
    memberCount: v.number(),
    score: v.number(),
    distinctSources: v.number(),
    totalMentions: v.number(),
    memberArticleIds: v.array(v.id('articles')),
  },
  handler: async (ctx, args) => {
    const clusterId = await ctx.db.insert('clusters', {
      runId: args.runId,
      label: args.label,
      primaryArticleId: args.primaryArticleId,
      memberCount: args.memberCount,
      score: args.score,
      distinctSources: args.distinctSources,
      totalMentions: args.totalMentions,
    });

    // Insert cluster members
    for (const articleId of args.memberArticleIds) {
      await ctx.db.insert('clusterMembers', {
        clusterId,
        articleId,
        isPrimary: articleId === args.primaryArticleId,
      });
    }

    return clusterId;
  },
});

/**
 * Save an LLM summary for a cluster.
 */
export const saveSummary = mutation({
  args: {
    clusterId: v.id('clusters'),
    headline: v.string(),
    summary: v.string(),
    keyPoints: v.array(v.string()),
    perspectives: v.array(v.string()),
    importance: v.optional(v.number()),
    language: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('clusterSummaries', {
      clusterId: args.clusterId,
      headline: args.headline,
      summary: args.summary,
      keyPoints: args.keyPoints,
      perspectives: args.perspectives,
      importance: args.importance,
      language: args.language,
      model: args.model,
      createdAt: new Date().toISOString(),
    });
  },
});

/**
 * Get topics (clusters + summaries) for a specific date.
 * Joins pipelineRuns -> clusters -> clusterSummaries.
 */
export const getTopicsByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    // Find pipeline runs for this date
    const runs = await ctx.db
      .query('pipelineRuns')
      .withIndex('by_date', (q) => q.eq('date', date))
      .collect();

    if (runs.length === 0) return [];

    // Use the latest run
    const latestRun = runs[runs.length - 1];

    // Get clusters for this run
    const clusters = await ctx.db
      .query('clusters')
      .withIndex('by_runId', (q) => q.eq('runId', latestRun._id))
      .collect();

    // Get summaries and member articles for each cluster
    const topics = [];
    for (const cluster of clusters) {
      const summary = await ctx.db
        .query('clusterSummaries')
        .withIndex('by_clusterId', (q) => q.eq('clusterId', cluster._id))
        .first();

      // Get member articles for URLs
      const members = await ctx.db
        .query('clusterMembers')
        .withIndex('by_clusterId', (q) => q.eq('clusterId', cluster._id))
        .collect();

      const urls: Array<{ name: string; url: string }> = [];
      for (const member of members) {
        const article = await ctx.db.get(member.articleId);
        if (article?.url) {
          urls.push({
            name: article.feedName ?? article.feedId,
            url: article.url,
          });
        }
      }

      if (summary) {
        topics.push({
          headline: summary.headline,
          summary: summary.summary,
          keyPoints: summary.keyPoints,
          urls: urls.slice(0, 8),
          distinctSources: cluster.distinctSources,
          totalMentions: cluster.totalMentions,
          score: cluster.score,
        });
      }
    }

    // Sort by score descending
    topics.sort((a, b) => b.score - a.score);
    return topics;
  },
});

/**
 * Get topic history across multiple days.
 * Returns topics grouped by date for trend comparison.
 */
export const getTopicHistory = query({
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const runs = await ctx.db
      .query('pipelineRuns')
      .withIndex('by_date')
      .filter((q) => q.gte(q.field('date'), cutoffStr))
      .collect();

    // Group by date, pick latest run per date
    const runsByDate = new Map<string, typeof runs[0]>();
    for (const run of runs) {
      const existing = runsByDate.get(run.date);
      if (!existing || run.startedAt > existing.startedAt) {
        runsByDate.set(run.date, run);
      }
    }

    const history = [];
    for (const [date, run] of runsByDate) {
      const clusters = await ctx.db
        .query('clusters')
        .withIndex('by_runId', (q) => q.eq('runId', run._id))
        .collect();

      const topics = [];
      for (const cluster of clusters.slice(0, 5)) {
        const summary = await ctx.db
          .query('clusterSummaries')
          .withIndex('by_clusterId', (q) => q.eq('clusterId', cluster._id))
          .first();
        if (summary) {
          topics.push({
            headline: summary.headline,
            score: cluster.score,
            distinctSources: cluster.distinctSources,
            totalMentions: cluster.totalMentions,
          });
        }
      }

      history.push({
        date,
        topicCount: clusters.length,
        topics,
      });
    }

    history.sort((a, b) => b.date.localeCompare(a.date));
    return history;
  },
});

/**
 * Delete clusters and their members/summaries for a given run.
 */
export const deleteClustersByRunId = mutation({
  args: { runId: v.id('pipelineRuns') },
  handler: async (ctx, { runId }) => {
    const clusters = await ctx.db
      .query('clusters')
      .withIndex('by_runId', (q) => q.eq('runId', runId))
      .collect();

    let deleted = 0;
    for (const cluster of clusters) {
      // Delete summaries
      const summaries = await ctx.db
        .query('clusterSummaries')
        .withIndex('by_clusterId', (q) => q.eq('clusterId', cluster._id))
        .collect();
      for (const s of summaries) {
        await ctx.db.delete(s._id);
      }

      // Delete members
      const members = await ctx.db
        .query('clusterMembers')
        .withIndex('by_clusterId', (q) => q.eq('clusterId', cluster._id))
        .collect();
      for (const m of members) {
        await ctx.db.delete(m._id);
      }

      // Delete cluster
      await ctx.db.delete(cluster._id);
      deleted++;
    }

    return deleted;
  },
});
