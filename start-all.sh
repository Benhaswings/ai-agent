#!/bin/bash
# Auto-start script for GitHub Agent
# Run this after WSL reboots

echo "🤖 Starting GitHub Agent..."

# Kill any existing processes
pkill -f "local-processor" 2>/dev/null
pkill -f "server.js" 2>/dev/null
tmux kill-session -t webui 2>/dev/null
tmux kill-session -t processor 2>/dev/null
sleep 2

cd ~/github-agent
source .env

# Start local processor in tmux
echo "Starting job processor..."
tmux new-session -d -s processor "cd ~/github-agent && source .env && exec ./scripts/local-processor.sh 2>&1 | tee -a ~/github-agent/local-processor.log"

sleep 2

# Start web UI in tmux
echo "Starting web UI..."
tmux new-session -d -s webui "cd ~/github-agent && source .env && exec node event-handler/server.js 2>&1 | tee -a ~/github-agent/server.log"

sleep 2

# Check status
echo ""
echo "✅ Services started!"
echo ""
tmux ls
echo ""
echo "📱 Telegram Bot: @KiloZuluLoboBot"
echo "🌐 Web UI: http://172.27.89.245:3000"
echo ""
echo "Commands:"
echo "  tmux attach -t processor   # View processor"
echo "  tmux attach -t webui       # View web server"
echo "  tmux ls                    # Check status"
