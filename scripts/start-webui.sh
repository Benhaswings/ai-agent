#!/bin/bash
# Start Web UI Server in tmux

echo "Starting Web UI Server in tmux..."

# Kill any existing server
pkill -f "server.js" 2>/dev/null

# Create tmux session and start server
tmux new-session -d -s webui "cd ~/github-agent && source .env && exec node event-handler/server.js 2>&1 | tee -a ~/github-agent/server.log"

sleep 2

# Check status
if tmux ls | grep -q webui; then
    echo "✅ Server started in tmux session 'webui'"
    echo ""
    echo "Access the Web UI:"
    echo "  http://172.27.89.245:3000"
    echo ""
    echo "Tmux commands:"
    echo "  tmux attach -t webui    # View server"
    echo "  tmux detach              # Exit (Ctrl+B then D)"
    echo "  tmux kill-session -t webui  # Stop server"
else
    echo "❌ Failed to start server"
fi
