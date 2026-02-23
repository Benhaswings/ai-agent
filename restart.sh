#!/bin/bash
# Quick restart - just the processor (for Telegram use)

echo "🔄 Restarting GitHub Agent Processor..."

# Kill old
pkill -9 -f "local-processor" 2>/dev/null
sleep 2

# Start new
cd ~/github-agent
source .env

# Use setsid to detach from terminal
setsid ./scripts/local-processor.sh >> ~/github-agent/local-processor.log 2>&1 &

sleep 3

# Check
if pgrep -f "local-processor" > /dev/null; then
    echo "✅ Processor running!"
    echo "📱 Send a message to @KiloZuluLoboBot"
else
    echo "❌ Failed to start"
fi
