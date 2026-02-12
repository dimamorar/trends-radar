/**
 * Retention-based cleanup for processed data.
 *
 * Deletes pipeline runs, clusters, summaries, members, and articles
 * older than the configured retention period.
 */

import { v } from 'convex/values';
import { mutation } from './_generated/server';

/**
 * Delete all processed data older than a cutoff date.
 * Cascades: runs -> clusters -> members + summaries, then orphaned articles.
 */
export const cleanupOldData = mutation({
  args: { cutoffDate: v.string() },
  handler: async (ctx, { cutoffDate }) => {
    let totalDeleted = 0;

    // 1. Find old pipeline runs
    const oldRuns = await ctx.db
      .query('pipelineRuns')
      .withIndex('by_date')
      .filter((q) => q.lt(q.field('date'), cutoffDate))
      .collect();

    for (const run of oldRuns) {
      // 2. Delete clusters for this run (cascades to members + summaries)
      const clusters = await ctx.db
        .query('clusters')
        .withIndex('by_runId', (q) => q.eq('runId', run._id))
        .collect();

      for (const cluster of clusters) {
        // Delete summaries
        const summaries = await ctx.db
          .query('clusterSummaries')
          .withIndex('by_clusterId', (q) => q.eq('clusterId', cluster._id))
          .collect();
        for (const s of summaries) {
          await ctx.db.delete(s._id);
          totalDeleted++;
        }

        // Delete members
        const members = await ctx.db
          .query('clusterMembers')
          .withIndex('by_clusterId', (q) => q.eq('clusterId', cluster._id))
          .collect();
        for (const m of members) {
          await ctx.db.delete(m._id);
          totalDeleted++;
        }

        // Delete cluster
        await ctx.db.delete(cluster._id);
        totalDeleted++;
      }

      // Delete the run itself
      await ctx.db.delete(run._id);
      totalDeleted++;
    }

    // 3. Delete articles not seen since cutoff
    const oldArticles = await ctx.db
      .query('articles')
      .withIndex('by_lastSeenAt')
      .filter((q) => q.lt(q.field('lastSeenAt'), cutoffDate))
      .collect();

    for (const article of oldArticles) {
      await ctx.db.delete(article._id);
      totalDeleted++;
    }

    return totalDeleted;
  },
});
