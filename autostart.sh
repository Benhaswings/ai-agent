#!/bin/bash
# Auto-start script for GitHub Agent on WSL boot

# Wait a moment for WSL to fully initialize
sleep 5

# Check if Docker is running
if ! docker ps > /dev/null 2>&1; then
    echo "Waiting for Docker..."
    # Try to start Docker service if not running
    sudo service docker start 2>/dev/null || sudo systemctl start docker 2>/dev/null || true
    sleep 5
fi

# Change to project directory
cd ~/github-agent

# Check if containers are already running
if ! docker ps | grep -q "github-agent-app"; then
    echo "Starting GitHub Agent containers..."
    
    # Start Ollama
    if ! docker ps | grep -q "github-agent-ollama"; then
        docker run -d \
            --name github-agent-ollama \
            -p 11435:11434 \
            -v github-agent-ollama-models:/root/.ollama \
            --restart unless-stopped \
            ollama/ollama:latest 2>/dev/null || docker start github-agent-ollama 2>/dev/null || echo "Ollama already running or failed"
    fi
    
    # Wait for Ollama
    sleep 10
    
    # Start App
    docker run -d \
        --name github-agent-app \
        --network github-agent_default 2>/dev/null || --network host \
        -v ~/github-agent:/app:rw \
        -v ~/github-agent/.env:/app/.env:ro \
        -e OLLAMA_HOST=http://ollama:11434 \
        -e PORT=3000 \
        -p 3001:3000 \
        --restart unless-stopped \
        node:20 \
        bash -c "cd /app && npm install --legacy-peer-deps && source .env && node event-handler/server.js" 2>/dev/null || echo "App already running"
    
    # Start Processor
    docker run -d \
        --name github-agent-processor \
        --network github-agent_default 2>/dev/null || --network host \
        -v ~/github-agent:/app:rw \
        -v ~/github-agent/.env:/app/.env:ro \
        -e OLLAMA_HOST=http://ollama:11434 \
        --restart unless-stopped \
        node:20 \
        bash -c "cd /app && npm install --legacy-peer-deps && source .env && ./scripts/local-processor.sh" 2>/dev/null || echo "Processor already running"
    
    echo "✅ GitHub Agent started!"
else
    echo "✅ GitHub Agent is already running"
fi
