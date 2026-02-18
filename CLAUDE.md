# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrendRadar is a hot news aggregation and analysis platform built with TypeScript on the Bun runtime. It fetches news from RSS feeds, analyzes them using keyword matching, optionally applies AI analysis, and delivers reports via multiple notification channels.

## Build & Development Commands

```bash
# Install dependencies
bun install

# Development with hot reload
bun run dev

# Type checking
bun run typecheck

# Linting and formatting (Biome)
bun run lint              # Check for issues
bun run lint:fix          # Auto-fix lint issues
bun run format            # Format code
bun run check             # Full Biome check with auto-fix

# Build
bun run build             # Compile TypeScript to dist/

# Run different entrypoints
bun run start             # Run compiled version (main pipeline)
bun run bot               # Run Telegram bot (dev)
bun run bot:prod          # Run Telegram bot (compiled)
```

## Architecture

### Core Pipeline

```
RSS Feeds → Fetch & Parse → Keyword Matching/Scoring → Deduplication → Optional AI Analysis → Report Generation → Notifications
```

### Key Directories

- `src/core/` - Keyword parsing (`frequency.ts`), weight scoring (`analyzer.ts`), config loading (`config.ts`), AppContext (`context.ts`)
- `src/ai/` - Multi-provider AI client using Vercel AI SDK (OpenAI, Anthropic, Google, DeepSeek)
- `src/bot/` - Interactive Telegram bot (grammy framework) with subscriber management
- `src/storage/` - Pluggable backends: SQLite (`local.ts`) or S3-compatible (`remote.ts`)
- `src/notification/` - Multi-channel delivery (Telegram, Email, Slack, webhooks)
- `src/report/` - Report generation and HTML rendering
- `src/crawler/` - RSS feed fetching and parsing
### Central Patterns

**AppContext** (`src/core/context.ts`): Dependency injection container that encapsulates configuration, storage backend, and time utilities. All config-dependent operations flow through this class.

**Storage Abstraction**: `StorageBase` abstract class with `LocalStorage` (SQLite) and `RemoteStorage` (S3) implementations. Backend auto-selected via environment or config.

**Configuration**: YAML-based (`config/config.yaml`) with environment variable interpolation (`${VAR_NAME}`). Validated with Zod schemas (`src/core/configSchema.ts`). Config keys use camelCase.

**AI Client** (`src/ai/client.ts`): Uses Vercel AI SDK v6. Model format is `provider/model` (e.g., `anthropic/claude-sonnet-4-20250514`, `openai/gpt-4o`). Supports automatic fallback models.

### Entrypoints

The app supports multiple entrypoints controlled by `app.entrypoint` in config or `TRENDRADAR_ENTRYPOINT` env var:
- `run` - Main analysis pipeline (default)
- `bot` - Telegram bot only
- `both` - Run pipeline then start bot

## Configuration Files

- `config/config.yaml` - Main config (platforms, RSS feeds, notifications, AI settings)
- `config/frequency_words.txt` - Keywords with AND/OR/NOT logic, groups, categories
- `.env.local` - Environment variables (API keys, tokens)

## Debugging

VS Code/Cursor launch configurations are in `.vscode/launch.json`:
- **Debug Main** - Run main pipeline with breakpoints
- **Debug Bot** - Run Telegram bot (`TRENDRADAR_ENTRYPOINT=bot`)
- **Debug File** - Run currently open file
- **Attach Bun** - Attach to running Bun process (`bun --inspect`)

Runtime debug options:
- `LOG_LEVEL=debug` - Set pino log level
- `TRENDRADAR_VERBOSE=1` or `runtime.verbose: true` in config - Enable verbose logging

See `docs/DEBUG.md` for full details.

## Code Style

- **Formatter**: Biome - 2-space indent, 100 char line width, single quotes, always semicolons
- **TypeScript**: Strict mode enabled, path alias `@/*` maps to `src/*`
- **Module system**: ESM with Bun bundler resolution
