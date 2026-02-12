/**
 * Article CRUD + embedding cache
 *
 * Convex server functions for managing articles and their embeddings.
 * The pipeline calls these via ConvexHttpClient from Bun.
 */

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Batch lookup articles by URLs -- used for embedding cache check.
 * Returns articles that already have embeddings so the pipeline can skip re-embedding.
 */
export const getArticlesByUrls = query({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, { urls }) => {
    const results = [];
    for (const url of urls) {
      const article = await ctx.db
        .query("articles")
        .withIndex("by_url", (q) => q.eq("url", url))
        .unique();
      if (article && article.embedding) {
        results.push({
          _id: article._id,
          url: article.url,
          embedding: article.embedding,
          embeddingModel: article.embeddingModel,
        });
      }
    }
    return results;
  },
});

/**
 * Upsert a single article (insert or update by URL).
 */
export const upsertArticle = mutation({
  args: {
    url: v.string(),
    title: v.string(),
    content: v.optional(v.string()),
    feedId: v.string(),
    feedName: v.optional(v.string()),
    publishedAt: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("articles")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        content: args.content,
        feedName: args.feedName,
        lastSeenAt: now,
        ...(args.embedding && { embedding: args.embedding }),
        ...(args.embeddingModel && { embeddingModel: args.embeddingModel }),
      });
      return existing._id;
    }

    return await ctx.db.insert("articles", {
      url: args.url,
      title: args.title,
      content: args.content,
      feedId: args.feedId,
      feedName: args.feedName,
      publishedAt: args.publishedAt,
      firstSeenAt: now,
      lastSeenAt: now,
      embedding: args.embedding,
      embeddingModel: args.embeddingModel,
    });
  },
});

/**
 * Batch upsert articles with embeddings.
 * Returns a map of url -> Convex document ID.
 */
export const upsertArticlesBatch = mutation({
  args: {
    articles: v.array(
      v.object({
        url: v.string(),
        title: v.string(),
        content: v.optional(v.string()),
        feedId: v.string(),
        feedName: v.optional(v.string()),
        publishedAt: v.optional(v.string()),
        embedding: v.optional(v.array(v.float64())),
        embeddingModel: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { articles }) => {
    const now = new Date().toISOString();
    const results: Array<{ url: string; _id: string }> = [];

    for (const article of articles) {
      const existing = await ctx.db
        .query("articles")
        .withIndex("by_url", (q) => q.eq("url", article.url))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: article.title,
          content: article.content,
          feedName: article.feedName,
          lastSeenAt: now,
          ...(article.embedding && { embedding: article.embedding }),
          ...(article.embeddingModel && {
            embeddingModel: article.embeddingModel,
          }),
        });
        results.push({ url: article.url, _id: existing._id });
      } else {
        const id = await ctx.db.insert("articles", {
          url: article.url,
          title: article.title,
          content: article.content,
          feedId: article.feedId,
          feedName: article.feedName,
          publishedAt: article.publishedAt,
          firstSeenAt: now,
          lastSeenAt: now,
          embedding: article.embedding,
          embeddingModel: article.embeddingModel,
        });
        results.push({ url: article.url, _id: id });
      }
    }

    return results;
  },
});

/**
 * Internal query to fetch article documents by IDs (used by vector search action).
 */
export const fetchArticlesByIds = internalQuery({
  args: { ids: v.array(v.id("articles")) },
  handler: async (ctx, { ids }) => {
    const results = [];
    for (const id of ids) {
      const doc = await ctx.db.get(id);
      if (doc) {
        results.push(doc);
      }
    }
    return results;
  },
});

/**
 * Vector search: find similar articles by embedding.
 * Only available as an action (Convex requirement for vector search).
 */
export const findSimilar = action({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    feedId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { embedding, limit, feedId },
  ): Promise<(Doc<"articles"> & { _score: number })[]> => {
    const results = await ctx.vectorSearch("articles", "by_embedding", {
      vector: embedding,
      limit: limit ?? 16,
      ...(feedId && { filter: (q) => q.eq("feedId", feedId) }),
    });

    // Fetch full article documents
    const articles: Doc<"articles">[] = await ctx.runQuery(
      internal.articles.fetchArticlesByIds,
      {
        ids: results.map((r) => r._id),
      },
    );

    return articles.map((article: Doc<"articles">, i: number) => ({
      ...article,
      _score: results[i]._score,
    }));
  },
});

/**
 * Get article by URL.
 */
export const getByUrl = query({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    return await ctx.db
      .query("articles")
      .withIndex("by_url", (q) => q.eq("url", url))
      .unique();
  },
});

/**
 * Get articles seen after a given date (for cleanup queries).
 */
export const getArticlesOlderThan = query({
  args: { cutoffDate: v.string() },
  handler: async (ctx, { cutoffDate }) => {
    const articles = await ctx.db
      .query("articles")
      .withIndex("by_lastSeenAt")
      .filter((q) => q.lt(q.field("lastSeenAt"), cutoffDate))
      .collect();
    return articles.map((a) => a._id);
  },
});
