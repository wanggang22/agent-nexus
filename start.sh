#!/bin/bash
# Start all AgentNexus services

echo "╔══════════════════════════════════════╗"
echo "║     AgentNexus — Starting Services   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Start Gateway first
npx tsx packages/gateway/src/index.ts &
PIDS=$!
sleep 2

# Start all agents
npx tsx packages/signal-agent/src/server.ts &
PIDS="$PIDS $!"

npx tsx packages/analyst-agent/src/server.ts &
PIDS="$PIDS $!"

npx tsx packages/risk-agent/src/server.ts &
PIDS="$PIDS $!"

npx tsx packages/trader-agent/src/server.ts &
PIDS="$PIDS $!"

sleep 2

# Start Telegram Bot (if token is set)
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
  npx tsx packages/telegram-bot/src/bot.ts &
  PIDS="$PIDS $!"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       All services started               ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Gateway:  http://localhost:4000          ║"
echo "║  Signal:   http://localhost:4001          ║"
echo "║  Analyst:  http://localhost:4002          ║"
echo "║  Risk:     http://localhost:4003          ║"
echo "║  Trader:   http://localhost:4004          ║"
echo "╠══════════════════════════════════════════╣"
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
echo "║  Telegram Bot: running                    ║"
else
echo "║  Telegram Bot: set TELEGRAM_BOT_TOKEN     ║"
fi
echo "╠══════════════════════════════════════════╣"
echo "║  Chat:  POST http://localhost:4000/chat   ║"
echo "║  Demo:  npx tsx packages/demo-client/...  ║"
echo "║  Press Ctrl+C to stop all                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Cleanup on exit
trap "echo ''; echo 'Shutting down...'; kill $PIDS 2>/dev/null; exit" SIGINT SIGTERM
wait
