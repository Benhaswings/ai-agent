#!/bin/bash
set -e

# Function to wait for Ollama to be ready
wait_for_ollama() {
    echo "⏳ Waiting for Ollama to be ready..."
    local retries=0
    local max_retries=30
    
    until curl -s http://ollama:11434/api/tags > /dev/null 2>&1 || curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge $max_retries ]; then
            echo "❌ Timeout waiting for Ollama"
            exit 1
        fi
        echo "   Still waiting... ($retries/$max_retries)"
        # Use bash sleep builtin
        (sleep 2) 2>/dev/null || (read -t 2) 2>/dev/null || echo -n "."
    done
    echo "✅ Ollama is ready!"
}

# Pull models if specified
pull_models() {
    if [ -n "$OLLAMA_MODELS" ]; then
        echo "📥 Pulling Ollama models: $OLLAMA_MODELS"
        for model in $(echo $OLLAMA_MODELS | tr ',' '\n'); do
            echo "   Pulling $model..."
            ollama pull $model || echo "⚠️ Failed to pull $model"
        done
        echo "✅ Models pulled!"
    fi
}

# Start Ollama in background if running standalone
if [ "$1" = "ollama" ]; then
    echo "🚀 Starting Ollama..."
    exec ollama serve
fi

# Wait for Ollama to be available
wait_for_ollama

# Pull models
pull_models

# Start the requested service
case "$1" in
    app|server)
        echo "🚀 Starting GitHub Agent Server..."
        cd /app && node event-handler/server.js
        ;;
    processor|worker)
        echo "🚀 Starting Job Processor..."
        cd /app && ./scripts/local-processor.sh
        ;;
    both|all)
        echo "🚀 Starting both services..."
        cd /app && node event-handler/server.js &
        ./scripts/local-processor.sh
        ;;
    setup)
        echo "⚙️ Running setup..."
        # Pull default models
        ollama pull llama3.2 || true
        ollama pull llama3.2:1b || true
        echo "✅ Setup complete!"
        ;;
    *)
        echo "Usage: docker-entrypoint.sh [ollama|app|processor|both|setup]"
        echo ""
        echo "Commands:"
        echo "  ollama    - Start Ollama server only"
        echo "  app       - Start GitHub Agent web server"
        echo "  processor - Start job processor"
        echo "  both      - Start both services"
        echo "  setup     - Pull default models"
        exit 1
        ;;
esac
