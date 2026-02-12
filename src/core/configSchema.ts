import { z } from "zod";

export const ConfigSchema = z.object({
  app: z
    .object({
      timezone: z.string().default("Asia/Shanghai"),
      showVersionUpdate: z.boolean().optional().default(false),
      entrypoint: z.enum(["run", "bot", "both"]).optional().default("run"),
    })
    .default({ timezone: "Asia/Shanghai" }),

  rss: z
    .object({
      freshnessFilter: z
        .object({
          enabled: z.boolean().default(true),
          maxAgeDays: z.number().default(1),
        })
        .optional(),
      feeds: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            url: z.string(),
            enabled: z.boolean().optional().default(true),
            category: z.string().optional(),
          })
        )
        .default([]),
    })
    .default({ feeds: [] }),

  report: z
    .object({
      mode: z.enum(["daily", "current", "incremental"]).default("daily"),
      displayMode: z.enum(["keyword", "platform"]).default("keyword"),
      maxNewsPerKeyword: z.number().default(10),
    })
    .default({ mode: "daily", displayMode: "keyword", maxNewsPerKeyword: 10 }),

  notification: z
    .object({
      enabled: z.boolean().default(false),
      channels: z
        .object({
          telegram: z
            .object({
              botToken: z.string(),
              chatId: z.string(),
              enabled: z.boolean().optional().default(true),
            })
            .optional(),
          feishu: z
            .object({
              webhookUrl: z.string(),
              secret: z.string().optional(),
              enabled: z.boolean().optional().default(true),
            })
            .optional(),
          dingtalk: z
            .object({
              webhookUrl: z.string(),
              secret: z.string().optional(),
              enabled: z.boolean().optional().default(true),
            })
            .optional(),
          wework: z
            .object({
              webhookUrl: z.string(),
              enabled: z.boolean().optional().default(true),
            })
            .optional(),
          email: z
            .object({
              smtpHost: z.string(),
              smtpPort: z.number().default(587),
              smtpUser: z.string(),
              smtpPassword: z.string(),
              from: z.string(),
              to: z.string(),
              enabled: z.boolean().optional().default(true),
            })
            .optional(),
          slack: z
            .object({
              webhookUrl: z.string(),
              enabled: z.boolean().optional().default(true),
            })
            .optional(),
          bark: z
            .object({
              serverUrl: z.string(),
              deviceKey: z.string(),
              enabled: z.boolean().optional().default(true),
            })
            .optional(),
          ntfy: z
            .object({
              serverUrl: z.string().default("https://ntfy.sh"),
              topic: z.string(),
              token: z.string().optional(),
              enabled: z.boolean().optional().default(true),
            })
            .optional(),
        })
        .default({}),
    })
    .default({ enabled: false, channels: {} }),

  storage: z
    .object({
      backend: z.enum(["local", "remote", "auto"]).default("local"),
      formats: z
        .object({
          sqlite: z.boolean().default(true),
          txt: z.boolean().default(false),
          html: z.boolean().default(true),
        })
        .default({ sqlite: true, txt: false, html: true }),
      local: z
        .object({
          dataDir: z.string().default("output"),
          retentionDays: z.number().default(7),
        })
        .default({ dataDir: "output", retentionDays: 7 }),
      remote: z
        .object({
          bucketName: z.string(),
          accessKeyId: z.string(),
          secretAccessKey: z.string(),
          endpointUrl: z.string(),
          region: z.string().default("auto"),
          retentionDays: z.number().optional(),
        })
        .optional(),
      pull: z
        .object({
          enabled: z.boolean().default(false),
          days: z.number().default(7),
        })
        .optional(),
    })
    .default({
      backend: "local",
      formats: { sqlite: true, txt: false, html: true },
      local: { dataDir: "output", retentionDays: 7 },
    }),

  ai: z
    .object({
      model: z.string().default("gpt-4o"),
      apiKey: z.string(),
      apiBase: z.string().optional(),
      timeout: z.number().default(120),
    })
    .default({ model: "gpt-4o", apiKey: "", timeout: 120 }),

  aiAnalysis: z
    .object({
      enabled: z.boolean().default(false),
      language: z.string().default("Chinese"),
      promptFile: z.string().optional(),
    })
    .default({ enabled: false, language: "Chinese" }),

  display: z
    .object({
      regions: z
        .object({
          hotlist: z.boolean().default(true),
          rss: z.boolean().default(true),
          newItems: z.boolean().default(true),
          aiAnalysis: z.boolean().default(true),
        })
        .default({
          hotlist: true,
          rss: true,
          newItems: true,
          aiAnalysis: true,
        }),
      regionOrder: z.array(z.string()).optional(),
    })
    .default({
      regions: { hotlist: true, rss: true, newItems: true, aiAnalysis: true },
    }),

  telegramChannels: z
    .object({
      enabled: z.boolean().default(false),
      apiId: z.string(),
      apiHash: z.string(),
      sessionString: z.string().optional(),
      scrapeHours: z.number().default(24),
      limitPerChannel: z.number().default(50),
      channels: z
        .array(
          z.object({
            username: z.string(),
            tier: z.number().optional(),
            category: z.string().optional(),
          })
        )
        .default([]),
    })
    .optional(),

  weightConfig: z
    .object({
      rank: z.number().default(1),
      frequency: z.number().default(1),
      hotness: z.number().default(1),
    })
    .optional(),

  rankThreshold: z.number().optional().default(50),

  bot: z
    .object({
      enabled: z.boolean().default(true),
      botToken: z.string().default(""),
      adminUserIds: z.array(z.number()).default([]),
      rateLimit: z
        .object({
          reportsPerHour: z.number().default(6),
          cooldownMinutes: z.number().default(5),
        })
        .default({ reportsPerHour: 6, cooldownMinutes: 5 }),
      databasePath: z.string().default("output/bot/bot.db"),
    })
    .optional(),

  aiPipeline: z
    .object({
      enabled: z.boolean().default(false),
      classification: z
        .object({
          model: z.string().default('anthropic/claude-haiku-4-5-20251001'),
          batchSize: z.number().default(10),
          concurrency: z.number().default(3),
        })
        .optional(),
      embedding: z
        .object({
          model: z.string().default('openai/text-embedding-3-small'),
          cacheEnabled: z.boolean().default(false),
        })
        .default({ model: 'openai/text-embedding-3-small', cacheEnabled: false }),
      clustering: z
        .object({
          similarityThreshold: z.number().min(0).max(1).default(0.82),
        })
        .default({ similarityThreshold: 0.82 }),
      summarization: z
        .object({
          model: z.string().default('openai/gpt-4o-mini'),
          minImportance: z.number().min(0).max(1).default(0.3),
          maxTopics: z.number().default(12),
        })
        .default({ model: 'openai/gpt-4o-mini', minImportance: 0.3, maxTopics: 12 }),
      scoring: z
        .object({
          minSources: z.number().default(1),
          minMentions: z.number().default(3),
          sourceExponent: z.number().default(1.4),
        })
        .default({ minSources: 1, minMentions: 3, sourceExponent: 1.4 }),
    })
    .optional(),

  convex: z
    .object({
      enabled: z.boolean().default(false),
      url: z.string().default(''),
    })
    .optional(),

  runtime: z
    .object({
      verbose: z.boolean().default(false),
      dryRun: z.boolean().default(false),
      outputDir: z.string().optional(),
      ai: z.enum(["on", "off", "config"]).default("config"),
      mode: z
        .enum(["daily", "current", "incremental", "config"])
        .default("config"),
      dedupThreshold: z
        .number()
        .min(0, "dedup_threshold must be between 0 and 1")
        .max(1, "dedup_threshold must be between 0 and 1")
        .optional(),
    })
    .optional(),
});
