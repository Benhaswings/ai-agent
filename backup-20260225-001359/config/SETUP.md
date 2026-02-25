# GitHub Agent — Environment Setup

## Required Secrets (GitHub)

Go to Settings → Secrets and variables → Actions, add:

| Secret | Description |
|--------|-------------|
| `GITHUB_TOKEN` | Auto-provided, no need to set |
| `ANTHROPIC_API_KEY` | For Claude API (optional) |
| `OPENAI_API_KEY` | For OpenAI API (optional) |
| `OLLAMA_HOST` | Your Ollama instance URL (optional) |
| `TELEGRAM_BOT_TOKEN` | For Telegram notifications (optional) |

## Local Environment Variables

```bash
export GITHUB_TOKEN=ghp_your_token_here
export GITHUB_REPO=yourname/github-agent
export TELEGRAM_BOT_TOKEN=your_bot_token  # optional
export OLLAMA_HOST=http://your-ollama:11434  # optional
```

## Setup Steps

1. Fork this repo on GitHub
2. Clone locally: `git clone https://github.com/YOURNAME/github-agent.git`
3. Install deps: `cd github-agent && npm install`
4. Set env vars (see above)
5. Start handler: `npm start`
6. Open http://localhost:3000

## Using Ollama from GitHub Actions

GitHub Actions can't reach your local Ollama directly. Options:

1. **Use a cloud Ollama** (RunPod, etc.)
2. **Use API models** (Claude, OpenAI)
3. **Self-hosted runner** (run Actions on your machine)
4. **Expose Ollama via ngrok** (for testing only):
   ```bash
   ngrok http 11434
   # Set OLLAMA_HOST to the ngrok URL
   ```
