# TrendRadar Telegram Bot

Interactive Telegram bot for TrendRadar. Supports user subscriptions, on-demand analyzed reports, and scheduled delivery.

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
  scheduleReportCron: "0 7 * * *"
  reportTimezone: "Europe/Kyiv"
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

## Daily Auto-Report (Bot Scheduler Enabled)

Recommended production flow:
1. Keep bot container running continuously
2. Configure bot scheduler:
   - `bot.scheduleReportCron` (required for auto-send)
   - `bot.reportTimezone` (optional timezone for cron execution)
3. Ensure active subscribers exist (`/subscribe`)
4. Ensure AI pipeline is configured:
   - `aiPipeline.enabled: true`
   - `AI_API_KEY` set

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
1. Confirm `bot.scheduleReportCron` is set and valid
2. Confirm `bot.reportTimezone` matches intended zone
3. Confirm bot process is running continuously at trigger time
4. Check logs for:
   - `[Bot] Scheduled broadcast enabled`
   - `[Bot] Running scheduled broadcast`
   - `[Broadcast] Report generation failed` (AI/pipeline issues)

Report not sent today:
1. Verify at least one active subscriber in `output/bot/bot.db`
2. Verify `AI_API_KEY` and `aiPipeline.enabled: true`
3. Check if RSS fetch returned items for today (feed freshness/date filter)
4. Review broadcast result logs for `reportErrorCode` / `reportErrorMessage`
