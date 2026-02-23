# GitHub Agent — Quick Reference

## What You Just Got

A **Pope Bot-style autonomous agent** that runs on GitHub's free Actions compute:

- ✅ Submit jobs via web UI or API
- ✅ Jobs run in GitHub Actions (free tier)
- ✅ Results committed back to git
- ✅ Full audit trail (every action = git commit)
- ✅ Parallel job execution
- ✅ Supports Ollama, Claude, or OpenAI

## File Structure

```
github-agent/
├── .github/workflows/       # GitHub Actions automation
│   ├── run-agent.yml        # Main job processor
│   └── scheduled.yml        # Cron tasks (every 15 min)
├── agent/                   # Docker agent that runs jobs
│   ├── package.json
│   └── run.js              # Main agent logic
├── event-handler/           # Local web server
│   ├── package.json
│   └── server.js           # Web UI + API
├── jobs/                    # Job queue
│   ├── pending/            # Waiting to run
│   ├── processing/         # Currently running
│   ├── completed/          # Done successfully
│   └── failed/             # Failed jobs
├── memory/                 # Long-term storage
├── config/                 # Configuration
├── scripts/
│   └── setup.sh            # Quick setup
├── README.md
├── package.json
└── .env.example
```

## How to Use

### 1. Setup (One-time)

```bash
cd ~/github-agent
./scripts/setup.sh
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your tokens
export GITHUB_TOKEN=ghp_...
export GITHUB_REPO=yourname/github-agent
```

### 3. Start Local Server

```bash
npm start
# Opens http://localhost:3000
```

### 4. Submit a Job

**Via Web UI:**
- Open http://localhost:3000
- Type your request
- Click Submit

**Via API:**
```bash
curl -X POST http://localhost:3000/job \
  -H "Content-Type: application/json" \
  -d '{"type": "chat", "prompt": "Hello!"}'
```

### 5. Job Runs in GitHub Actions

- Job file pushed to `jobs/pending/`
- GitHub Actions detects change
- Spins up Ubuntu container
- Runs agent with your prompt
- Commits result to `jobs/completed/`

## Job Types

| Type | Description |
|------|-------------|
| `chat` | General conversation |
| `code` | Code generation with file output |
| `research` | Web search + synthesis |
| `file` | File operations |

## Model Support

The agent tries in order:
1. **Ollama** (local/cloud) — set `OLLAMA_HOST`
2. **Claude** — set `ANTHROPIC_API_KEY`
3. **OpenAI** — set `OPENAI_API_KEY`

## GitHub Actions Quota

- Free tier: **2,000 minutes/month**
- Typical job: ~1 minute
- You can run: **~2,000 jobs/month**

## Ollama from GitHub Actions

**Problem:** GitHub Actions can't reach your local Ollama

**Solutions:**

1. **Use API models** (easiest) — Claude/OpenAI
2. **Cloud Ollama** — RunPod, etc.
3. **Self-hosted runner** — Run Actions on your machine
4. **ngrok** (dev only):
   ```bash
   ngrok http 11434
   # Set OLLAMA_HOST to the https URL
   ```

## Next Steps

1. Create a GitHub repo
2. Push this code
3. Add your tokens as GitHub Secrets
4. Start the event handler
5. Submit your first job!

## Comparison: The Pope Bot vs This

| | The Pope Bot | This Agent |
|---|---|---|
| Complexity | High (Docker, ngrok) | Medium (pure Node.js) |
| Pi Integration | Built-in | Add your own |
| Self-modifying | Yes (PR-based) | You can add it |
| Notifications | Yes | Basic (add Telegram) |
| Web UI | No | Yes (built-in) |

This is a simpler, more hackable starting point.
