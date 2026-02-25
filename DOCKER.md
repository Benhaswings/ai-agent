# GitHub Agent - Docker Setup

Run the entire GitHub Agent stack in Docker with Ollama included!

## 🚀 Quick Start

```bash
# Run the setup script
chmod +x setup-docker.sh
./setup-docker.sh
```

Or manually:

```bash
# Build and start
docker-compose up -d

# Pull models
docker-compose exec ollama ollama pull llama3.2
docker-compose exec ollama ollama pull llama3.2:1b
```

## 📁 Services

| Service | Port | Description |
|---------|------|-------------|
| Ollama | 11434 | AI model server |
| GitHub Agent | 3000 | Web UI & Telegram bot |
| Processor | - | Background job processor |

## 🔧 Configuration

1. Copy your `.env` file to the project root
2. Update `OLLAMA_HOST=http://ollama:11434` in docker-compose.yml
3. All your API keys (Telegram, Brave, Claude) go in `.env`

## 💾 Persistent Storage

Models and data are persisted using Docker volumes:
- `ollama-models` - Downloaded AI models
- `./jobs` - Job queue
- `./memory` - Conversation history
- `./config` - Configuration files

## 🐳 Useful Commands

```bash
# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Stop services
docker-compose down

# Start services
docker-compose up -d

# Pull a new model
docker-compose exec ollama ollama pull phi3:mini

# Restart a service
docker-compose restart github-agent

# Shell into container
docker-compose exec github-agent bash
```

## 🎮 GPU Support (NVIDIA)

Uncomment the `deploy` section in `docker-compose.yml`:

```yaml
ollama:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

## 🔍 Troubleshooting

**Ollama not responding:**
```bash
docker-compose logs ollama
docker-compose restart ollama
```

**Models not loading:**
```bash
# Check available models
docker-compose exec ollama ollama list

# Pull a model manually
docker-compose exec ollama ollama pull llama3.2
```

**Port conflicts:**
```bash
# Check what's using port 3000
sudo lsof -i :3000

# Change ports in docker-compose.yml
ports:
  - "3001:3000"  # Use port 3001 instead
```

## 📊 Resource Usage

- **CPU**: Depends on model size (1B = low, 70B = high)
- **RAM**: ~2-8GB depending on loaded models
- **Disk**: ~2-20GB for models
- **GPU**: Optional but recommended for larger models

## 🔄 Updating

```bash
# Pull latest images
docker-compose pull

# Rebuild
docker-compose build --no-cache

# Restart
docker-compose up -d
```
