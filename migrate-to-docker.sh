#!/bin/bash
# Migration script: Move from native setup to Docker

echo "🐳 Migrating GitHub Agent to Docker"
echo "===================================="
echo ""

# Check if already running natively
if pgrep -f "event-handler/server.js" > /dev/null || pgrep -f "local-processor.sh" > /dev/null; then
    echo "⚠️  Native services detected. Stopping them first..."
    pkill -9 -f "event-handler/server.js" 2>/dev/null
    pkill -9 -f "local-processor.sh" 2>/dev/null
    pkill -9 -f "ollama" 2>/dev/null
    sleep 3
    echo "✅ Native services stopped"
    echo ""
fi

# Backup current state
echo "💾 Backing up current state..."
BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r jobs memory config "$BACKUP_DIR/" 2>/dev/null || true
cp .env "$BACKUP_DIR/" 2>/dev/null || true
echo "✅ Backup created: $BACKUP_DIR"
echo ""

# Check Docker
echo "🔍 Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found!"
    echo ""
    echo "Please install Docker first:"
    echo "  Ubuntu/Debian: sudo apt install docker.io docker-compose"
    echo "  Or visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found!"
    echo ""
    echo "Please install Docker Compose:"
    echo "  sudo apt install docker-compose"
    echo "  Or visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker found"
echo ""

# Update .env for Docker
echo "⚙️  Updating .env for Docker..."
if [ -f .env ]; then
    # Backup original
    cp .env .env.backup
    
    # Update OLLAMA_HOST
    sed -i 's|OLLAMA_HOST=.*|OLLAMA_HOST=http://ollama:11434|' .env
    
    echo "✅ .env updated"
else
    echo "⚠️  No .env file found. Creating from example..."
    cat > .env << 'EOF'
# AI Agent Environment
export GITHUB_TOKEN=your_token_here
export GITHUB_REPO=yourusername/github-agent
export OLLAMA_HOST=http://ollama:11434
export PORT=3000

# Telegram
export TELEGRAM_BOT_TOKEN=your_bot_token
export TELEGRAM_CHAT_ID=your_chat_id

# APIs (optional)
export BRAVE_API_KEY=
export ANTHROPIC_API_KEY=
EOF
    echo "⚠️  Please edit .env with your actual tokens!"
fi
echo ""

# Create directories
echo "📁 Creating directories..."
mkdir -p jobs/pending jobs/processing jobs/completed jobs/failed memory config
echo "✅ Directories ready"
echo ""

# Build and start
echo "🔨 Building Docker images (this may take a few minutes)..."
docker-compose build --no-cache
echo ""

echo "🚀 Starting Ollama service..."
docker-compose up -d ollama
sleep 5

echo ""
echo "📥 Pulling models..."
echo "   This will take several minutes depending on your internet speed."
echo ""
docker-compose exec -T ollama ollama pull llama3.2 &
PULL_PID=$!

# Show progress
while kill -0 $PULL_PID 2>/dev/null; do
    echo "   Still downloading..."
    sleep 30
done

wait $PULL_PID
echo "✅ Models downloaded"
echo ""

echo "🚀 Starting GitHub Agent services..."
docker-compose up -d
echo ""

# Show status
echo "✅ Migration complete!"
echo ""
echo "Services Status:"
docker-compose ps
echo ""
echo "Access your services:"
echo "  Ollama API: http://localhost:11434"
echo "  Web UI: http://localhost:3000"
echo ""
echo "View logs: docker-compose logs -f"
echo ""
echo "Backup saved to: $BACKUP_DIR"
