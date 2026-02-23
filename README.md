# GitHub Agent — Autonomous AI on Free Compute

An autonomous agent that runs on GitHub Actions free tier. Every action is a git commit.

## How It Works

1. **Trigger** → Create a job file in `jobs/pending/`
2. **GitHub Actions** → Detects new job, runs agent in Docker
3. **Agent Executes** → Does the work, writes results to `jobs/completed/`
4. **Commits** → All changes committed back to repo
5. **Notify** → You get notified (Telegram/Discord/Webhook)

## Quick Start

```bash
# 1. Fork this repo on GitHub
# 2. Clone your fork
git clone https://github.com/YOURNAME/github-agent.git
cd github-agent

# 3. Install dependencies
npm install

# 4. Configure
export GITHUB_TOKEN=your_token_here
export TELEGRAM_BOT_TOKEN=your_bot_token  # optional

# 5. Start local event handler
npm start
```

## Architecture

```
User Request → Event Handler → Git Push → GitHub Actions
                                                 ↓
                                         Docker Agent
                                                 ↓
                                         Commit Results
                                                 ↓
                                         Notify User
```

## Features

- ✅ Free GitHub Actions compute (2000 min/month)
- ✅ Git = Memory + Audit trail
- ✅ Self-modifying (agent can update its own code)
- ✅ Parallel jobs (run multiple tasks at once)
- ✅ Web interface + Telegram bot
- ✅ Local Ollama or API models

## Project Structure

```
.
├── .github/workflows/     # GitHub Actions definitions
├── agent/                 # Docker agent code
├── jobs/                  # Job queue (pending/completed)
├── memory/                # Long-term memory storage
├── config/                # Agent configuration
├── event-handler/         # Local webhook handler
└── web-ui/               # Simple web interface
```
