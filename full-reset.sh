#!/bin/bash
# COMPLETE RESET - Run this to restart everything fresh

echo "🔄 Resetting GitHub Agent..."

# Kill all processes
echo "Stopping all services..."
pkill -9 -f "node" 2>/dev/null
pkill -9 -f "server.js" 2>/dev/null
pkill -9 -f "local-processor" 2>/dev/null
sleep 5

# Clear port 3000
fuser -k 3000/tcp 2>/dev/null || true
sleep 2

# Go to directory
cd ~/github-agent || exit 1

# Load environment
source .env 2>/dev/null || true

# Start server
echo "Starting Telegram server..."
node event-handler/server.js >> server.log 2>&1 &
SERVER_PID=$!
sleep 3

# Start processor
echo "Starting job processor..."
./scripts/local-processor.sh >> local-processor.log 2>&1 &
PROCESSOR_PID=$!
sleep 3

# Check status
echo ""
echo "✅ Reset Complete!"
echo ""
echo "Server PID: $SERVER_PID"
echo "Processor PID: $PROCESSOR_PID"
echo ""
echo "📱 Try sending /start to @KiloZuluLoboBot now!"
echo ""
echo "If still not working:"
echo "1. Block @KiloZuluLoboBot in Telegram"
echo "2. Unblock it"
echo "3. Send /start again"
