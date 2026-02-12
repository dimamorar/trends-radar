/**
 * Pipeline run tracking
 *
 * Tracks each pipeline execution for auditability and historical queries.
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

/**
 * Create a new pipeline run record. Called at the start of runAIPipeline().
 */
export const createRun = mutation({
  args: {
    date: v.string(),
    startedAt: v.string(),
    totalItems: v.number(),
    dedupedItems: v.number(),
    embeddingModel: v.optional(v.string()),
    summaryModel: v.optional(v.string()),
    clusterThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('pipelineRuns', {
      date: args.date,
      startedAt: args.startedAt,
      totalItems: args.totalItems,
      dedupedItems: args.dedupedItems,
      embeddingModel: args.embeddingModel,
      summaryModel: args.summaryModel,
      clusterThreshold: args.clusterThreshold,
    });
  },
});

/**
 * Mark a pipeline run as complete with final stats.
 */
export const completeRun = mutation({
  args: {
    runId: v.id('pipelineRuns'),
    completedAt: v.string(),
    clusterCount: v.number(),
    topicCount: v.number(),
  },
  handler: async (ctx, { runId, completedAt, clusterCount, topicCount }) => {
    await ctx.db.patch(runId, {
      completedAt,
      clusterCount,
      topicCount,
    });
  },
});

/**
 * Get pipeline runs for a specific date.
 */
export const getRunsByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    return await ctx.db
      .query('pipelineRuns')
      .withIndex('by_date', (q) => q.eq('date', date))
      .collect();
  },
});

/**
 * Get the latest pipeline run.
 */
export const getLatestRun = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('pipelineRuns').order('desc').first();
  },
});

/**
 * Get pipeline runs older than a cutoff date (for cleanup).
 */
export const getRunsOlderThan = query({
  args: { cutoffDate: v.string() },
  handler: async (ctx, { cutoffDate }) => {
    const runs = await ctx.db
      .query('pipelineRuns')
      .withIndex('by_date')
      .filter((q) => q.lt(q.field('date'), cutoffDate))
      .collect();
    return runs.map((r) => r._id);
  },
});
