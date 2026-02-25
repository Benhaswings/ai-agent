#!/bin/bash
# Docker setup script for GitHub Agent with Ollama

echo "🐳 GitHub Agent Docker Setup"
echo "=============================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose:"
    echo "   https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose found"
echo ""

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p jobs/pending jobs/processing jobs/completed jobs/failed memory config

# Build and start services
echo ""
echo "🔨 Building Docker images..."
docker-compose build

echo ""
echo "🚀 Starting services..."
docker-compose up -d ollama

echo ""
echo "⏳ Waiting for Ollama to be ready..."
sleep 10

echo ""
echo "📥 Pulling default models (this may take a while)..."
docker-compose exec ollama ollama pull llama3.2 || true
docker-compose exec ollama ollama pull llama3.2:1b || true

echo ""
echo "🚀 Starting GitHub Agent services..."
docker-compose up -d

echo ""
echo "✅ Setup complete!"
echo ""
echo "Services:"
echo "  Ollama API: http://localhost:11434"
echo "  Web UI: http://localhost:3000"
echo ""
echo "Useful commands:"
echo "  docker-compose logs -f    # View logs"
echo "  docker-compose ps         # Check status"
echo "  docker-compose down       # Stop services"
echo "  docker-compose up -d      # Start services"
echo ""
echo "To pull additional models:"
echo "  docker-compose exec ollama ollama pull <model-name>"
