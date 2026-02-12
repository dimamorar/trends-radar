# TrendRadar Interactive Telegram Bot

This document covers the interactive Telegram bot functionality for TrendRadar.

## Overview

The TrendRadar bot allows users to:

- Subscribe to automatic report notifications
- Request reports on-demand
- Manage their subscription status

This is **new functionality** not present in the original Python version, which only supported push notifications to pre-configured chat IDs.

## Quick Start

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Enter a name for your bot (e.g., `TrendRadar News`)
4. Enter a username ending in `bot` (e.g., `my_trendradar_bot`)
5. Copy the token provided (format: `123456789:ABCdef...`)

### 2. Configure the Bot

Set your bot token as an environment variable:

```bash
export TELEGRAM_BOT_TOKEN="8595490220:AAFGBuDWdPcnhJVxojUkLeKd_JsKpSCpK80"
```

Or add it to `config/config.yaml`:

```yaml
bot:
  enabled: true
  bot_token: "${TELEGRAM_BOT_TOKEN}"
  admin_user_ids: []
  rate_limit:
    reports_per_hour: 6
    cooldown_minutes: 5
  database_path: "output/bot/bot.db"
```

### 3. Run the Bot

```bash
# Development mode (with hot reload)
bun run bot

# Production mode (compiled)
bun run build
bun run bot:prod
```

## Commands

### User Commands

| Command        | Description                               |
| -------------- | ----------------------------------------- |
| `/start`       | Register and receive welcome message      |
| `/subscribe`   | Enable automatic report notifications     |
| `/unsubscribe` | Disable automatic notifications           |
| `/report`      | Request a report on-demand (rate limited) |
| `/status`      | View subscription status and stats        |
| `/help`        | List available commands                   |

### Admin Commands

| Command      | Description                    |
| ------------ | ------------------------------ |
| `/stats`     | View bot statistics            |
| `/broadcast` | Send report to all subscribers |

## Configuration

### Bot Configuration Options

```yaml
bot:
  # Enable/disable the bot
  enabled: true

  # Bot token from BotFather (use env var for security)
  bot_token: "${TELEGRAM_BOT_TOKEN}"

  # Telegram user IDs with admin privileges
  # Get your ID from @userinfobot on Telegram
  admin_user_ids: [123456789]

  # Rate limiting for /report command
  rate_limit:
    # Maximum reports per user per hour
    reports_per_hour: 6
    # Cooldown between reports in minutes
    cooldown_minutes: 5

  # Path to SQLite database for subscriber data
  database_path: "output/bot/bot.db"
```

### Getting Your Telegram User ID

To configure admin access:

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your user ID (a number like `123456789`)
3. Add it to `admin_user_ids` in your config

## Architecture

### Directory Structure

```
src/bot/
├── index.ts                    # Module exports
├── bot.ts                      # TrendRadarBot class (grammy)
├── commands/
│   ├── index.ts                # Command exports
│   ├── start.ts                # /start handler
│   ├── subscribe.ts            # /subscribe handler
│   ├── unsubscribe.ts          # /unsubscribe handler
│   ├── report.ts               # /report handler
│   ├── status.ts               # /status handler
│   ├── help.ts                 # /help handler
│   └── stats.ts                # /stats handler (admin)
├── middleware/
│   └── rateLimit.ts            # Rate limiting
├── services/
│   ├── subscriber.ts           # Subscriber business logic
│   └── broadcast.ts            # Broadcast to all subscribers
└── storage/
    └── subscriber.ts           # SQLite storage
```

### Database Schema

The bot uses SQLite for subscriber data (`output/bot/bot.db`):

```sql
-- Subscriber records
CREATE TABLE subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id INTEGER NOT NULL UNIQUE,
    chat_id INTEGER NOT NULL,
    username TEXT,
    first_name TEXT,
    is_subscribed INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_report_sent_at TIMESTAMP,
    report_count INTEGER DEFAULT 0
);

-- Rate limiting records
CREATE TABLE report_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscriber_id INTEGER NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);
```

### Key Components

#### TrendRadarBot

Main bot class that:

- Initializes grammy Bot instance
- Sets up command handlers
- Manages graceful shutdown
- Runs in long-polling mode

#### SubscriberService

Business logic for:

- User registration
- Subscription management
- Admin status checks

#### RateLimiter

Prevents abuse of `/report` command:

- Configurable cooldown period
- Hourly request limits
- Admin bypass

#### BroadcastService

Sends reports to all active subscribers:

- Respects Telegram rate limits
- Tracks success/failure per subscriber

## Deployment

### Local Development

```bash
# Run directly
bun run bot

# Or with custom config
bun src/index.ts bot -c config/custom.yaml
```

### Docker

```bash
# Copy environment template
cp docker/.env.example docker/.env
# Edit docker/.env with your TELEGRAM_BOT_TOKEN

# Build and run
bun run build
docker compose -f docker/docker-compose.bot.yml up -d

# View logs
docker compose -f docker/docker-compose.bot.yml logs -f

# Stop
docker compose -f docker/docker-compose.bot.yml down
```

### Dokploy (Production)

1. Push code to GitHub
2. In Dokploy UI, create new project
3. Set compose file: `docker/docker-compose.dokploy.yml`
4. Add environment variable: `TELEGRAM_BOT_TOKEN`
5. Deploy

### Docker Files

| File                                | Purpose              |
| ----------------------------------- | -------------------- |
| `docker/Dockerfile.bot`             | Bot container image  |
| `docker/docker-compose.bot.yml`     | Local development    |
| `docker/docker-compose.dokploy.yml` | Production (Dokploy) |
| `docker/.env.example`               | Environment template |
| `docker/build-and-run.sh`           | Helper script        |

## Rate Limiting

The `/report` command is rate limited to prevent abuse:

- **Cooldown**: 5 minutes between requests (configurable)
- **Hourly limit**: 6 requests per hour (configurable)
- **Admin bypass**: Admins are not rate limited

When rate limited, users see a friendly message indicating when they can request again.

## Webhook Mode (Optional)

The bot runs in long-polling mode by default. For high-traffic scenarios, you can enable webhook mode:

1. Add domain labels to docker-compose (see `docker-compose.dokploy.yml`)
2. Update config to enable webhook
3. Configure Traefik or your reverse proxy

Long-polling is recommended for most use cases as it's simpler to set up.

## Troubleshooting

### Bot doesn't respond

1. Check bot token is correct
2. Verify bot is running: `docker compose logs`
3. Ensure you've sent `/start` first

### "Rate limit exceeded"

- Wait for the cooldown period
- Admins can bypass rate limits

### Reports are empty

- Ensure RSS feeds are configured and working
- Run `bun run dev` to crawl data first
- Check `output/rss/` for data files

### Database errors

- Ensure `output/bot/` directory exists and is writable
- Check file permissions in Docker volume

## Integration with Main App

The bot shares configuration and data with the main TrendRadar app:

- Uses same `config/config.yaml`
- Reads RSS data from `output/rss/`
- Uses same frequency words for keyword matching

You can run both the main crawler and the bot simultaneously:

```bash
# Terminal 1: Run crawler periodically
bun run dev

# Terminal 2: Run interactive bot
bun run bot
```

Or schedule the crawler with cron while the bot runs continuously.
