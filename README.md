# TrendRadar UA

Hot Ukrainian news aggregation and analysis platform built with TypeScript on the [Bun](https://bun.sh) runtime.

Aggregates RSS feeds from major Ukrainian media, deduplicates articles, optionally clusters and summarizes them with AI, and delivers reports via Telegram.

> Inspired by [sansan0/TrendRadar](https://github.com/sansan0/TrendRadar). Rewritten from scratch in TypeScript with a narrower scope: **Ukraine news only**.

## Features

- **10 Ukrainian RSS sources** out of the box — Українська правда, УНІАН, РБК-Україна, НВ, Цензор.НЕТ, ТСН, 24 Канал, Обозреватель, Кореспондент, LB.ua
- **AI pipeline** — embedding → cosine-similarity clustering → importance scoring → Ukrainian-language summaries (Vercel AI SDK; OpenAI, Anthropic, Google, DeepSeek)
- **Telegram notifications** — formatted reports pushed to a chat/channel; automatic message splitting for long reports
- **Interactive Telegram bot** — `/report`, `/subscribe`, `/status` and more; subscriber management with SQLite
- **Multiple report modes** — `daily` (full-day rollup), `current` (live snapshot), `incremental` (new items only)
- **Storage** — local SQLite (default) or S3-compatible remote; configurable retention
- **Timezone** — `Europe/Kyiv` by default

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0 (Node >= 20 also works)

### Install & configure

```bash
bun install
```

Copy `.env.local.example` to `.env.local` (or export env vars directly) and set at minimum:

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (from @BotFather) |
| `TELEGRAM_CHAT_ID` | Target chat / channel ID |
| `AI_API_KEY` | OpenAI (or other provider) key — required only if AI pipeline is enabled |

Edit `config/config.yaml` to tweak RSS feeds, report mode, AI settings, etc. Environment variables are interpolated via `${VAR_NAME}` syntax inside the YAML.

### Run

```bash
# Main analysis pipeline (fetch → analyze → notify)
bun run dev          # with hot-reload
bun run start        # compiled

# Telegram bot only
bun run bot

# Both pipeline then bot
# Set app.entrypoint: "both" in config or TRENDRADAR_ENTRYPOINT=both
```

## Configuration

All configuration lives in `config/config.yaml`. Key sections:

| Section | What it controls |
|---|---|
| `rss.feeds` | RSS sources (add/remove/disable) |
| `report.mode` | `daily` / `current` / `incremental` |
| `notification.channels.telegram` | Bot token & chat ID |
| `ai` | Model, API key, timeout |
| `aiPipeline` | Embeddings, clustering threshold, summarization model, scoring |
| `aiAnalysis` | Legacy single-prompt analysis (Ukrainian language) |
| `bot` | Admin IDs, rate limits, database path |
| `storage` | Backend (`local` / `remote`), retention, S3 credentials |
| `telegramChannels` | (Phase 2) Optional Telegram channel scraping |

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Run with watch mode |
| `bun run build` | Compile TypeScript to `dist/` |
| `bun run start` | Run compiled output |
| `bun run bot` | Run Telegram bot (dev) |
| `bun run bot:prod` | Run Telegram bot (compiled) |
| `bun run typecheck` | Type-check only |
| `bun run lint` | Biome lint |
| `bun run format` | Biome format |
| `bun run check` | Biome check + auto-fix |

## Project Structure

```
src/
├── core/           # Config loading, news analyzer, dedup, context
├── crawler/        # RSS feed fetching and parsing
├── ai/             # Embeddings, clustering, scoring, summarization, AI client
├── report/         # Report generation (text + HTML)
├── notification/   # Telegram sender, message splitting, rendering
├── bot/            # Interactive Telegram bot (grammy)
├── storage/        # SQLite local, S3 remote, Convex (experimental)
├── inspector/      # Dev inspector UI
├── types/          # Shared TypeScript types
└── utils/          # Logger, formatters, time helpers
config/
├── config.yaml                 # Main configuration
└── ai_analysis_prompt-en.txt   # AI analysis prompt template
```

See [CLAUDE.md](CLAUDE.md) for detailed architecture notes.

## License

MIT
