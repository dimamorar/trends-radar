# TrendRadar Telegram Bot

Interactive Telegram bot for TrendRadar. Supports user subscriptions and on-demand analyzed reports.

## Quick Start

### 1. Create bot token

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Run `/newbot`
3. Copy token (`123456789:...`)

### 2. Configure environment

At minimum:

```bash
export TELEGRAM_BOT_TOKEN="<your_token>"
```

Optional for pipeline-to-channel notifications:

```bash
export TELEGRAM_CHAT_ID="<chat_or_channel_id>"
export AI_API_KEY="<openai_key>"
```

### 3. Configure `config/config.yaml`

```yaml
app:
  entrypoint: "run" # overridden by TRENDRADAR_ENTRYPOINT in scripts/containers

bot:
  enabled: true
  botToken: "${TELEGRAM_BOT_TOKEN}"
  adminUserIds: []
  rateLimit:
    reportsPerHour: 6
    cooldownMinutes: 5
  databasePath: "output/bot/bot.db"
  # scheduleReportCron/reportTimezone can remain in config,
  # but scheduled broadcast is currently disabled in bot runtime.
```

## Run Modes

```bash
# Dev bot mode (explicit bot entrypoint)
bun run bot

# Build + prod bot mode
bun run build
bun run bot:prod
```

Entrypoints:
- `TRENDRADAR_ENTRYPOINT=bot` -> long-polling bot
- `TRENDRADAR_ENTRYPOINT=run` -> pipeline run (fetch/analyze/save/notify)
- `TRENDRADAR_ENTRYPOINT=both` -> pipeline then bot

## Commands

User:
- `/start`
- `/subscribe`
- `/unsubscribe`
- `/report`
- `/status`
- `/help`

Admin:
- `/stats`

## Dokploy Production

Use compose file: `docker/docker-compose.dokploy.yml`.

Required env:
- `TELEGRAM_BOT_TOKEN`

Recommended env:
- `TZ=Europe/Kyiv`

Optional env:
- `AI_API_KEY`
- `TELEGRAM_CHAT_ID` (only if pipeline should push to fixed channel/chat)

Container runs 24/7 in long-polling mode with:
- `TRENDRADAR_ENTRYPOINT=bot`

## Daily Pipeline (Bot Broadcast Disabled)

Recommended production flow:
1. Keep bot container running continuously
2. Add Dokploy Compose Schedule Job at `50 6 * * *` (Kyiv)
3. Job command:

```bash
env TRENDRADAR_ENTRYPOINT=run bun run dist/index.js
```

## Storage/Persistence

- Subscriber DB: `output/bot/bot.db`
- RSS data used for reports: `output/rss/*.db`
- Persist these via Docker volumes in production

## Troubleshooting

Bot not responding:
1. Check `TELEGRAM_BOT_TOKEN`
2. Check container logs
3. Send `/start` first

`/report` returns no data:
1. Ensure `aiPipeline.enabled: true` in config
2. Ensure `AI_API_KEY` is configured
3. Check bot logs for pipeline failure details

Duplicate polling conflict:
1. Ensure only one running instance uses the same bot token

Schedule not firing at expected local time:
1. Bot-side schedule is disabled
2. Use Dokploy scheduler + `TRENDRADAR_ENTRYPOINT=run` for timed runs
