#!/bin/bash
# Start all AgentNexus services

echo "Starting AgentNexus..."
echo ""

# Start Gateway
npx tsx packages/gateway/src/index.ts &
PIDS=$!

# Wait for gateway
sleep 2

# Start agents
npx tsx packages/signal-agent/src/server.ts &
PIDS="$PIDS $!"

npx tsx packages/analyst-agent/src/server.ts &
PIDS="$PIDS $!"

npx tsx packages/risk-agent/src/server.ts &
PIDS="$PIDS $!"

npx tsx packages/trader-agent/src/server.ts &
PIDS="$PIDS $!"

echo ""
echo "All services started. PIDs: $PIDS"
echo "Press Ctrl+C to stop all."
echo ""

# Wait for any signal
trap "kill $PIDS 2>/dev/null; exit" SIGINT SIGTERM
wait
