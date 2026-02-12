#!/bin/bash
# Build and run TrendRadar Bot locally with Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Check for .env file
if [ ! -f "docker/.env" ]; then
    echo "Error: docker/.env file not found"
    echo "Copy docker/.env.example to docker/.env and fill in your values"
    exit 1
fi

# Load environment variables
set -a
source docker/.env
set +a

# Check for required variables
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ "$TELEGRAM_BOT_TOKEN" = "your_bot_token_here" ]; then
    echo "Error: TELEGRAM_BOT_TOKEN not set in docker/.env"
    exit 1
fi

echo "Building TypeScript..."
bun run build

echo "Building Docker image..."
docker compose -f docker/docker-compose.bot.yml build

echo "Starting container..."
docker compose -f docker/docker-compose.bot.yml up -d

echo ""
echo "Bot is running! Check logs with:"
echo "  docker compose -f docker/docker-compose.bot.yml logs -f"
echo ""
echo "Stop with:"
echo "  docker compose -f docker/docker-compose.bot.yml down"
