#!/bin/bash
# Local Job Processor - Processes jobs without GitHub Actions

JOBS_DIR="$HOME/github-agent/jobs"
LOG_FILE="$HOME/github-agent/local-processor.log"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

echo "$(date): Local processor started" >> "$LOG_FILE"

# Load env if exists
if [ -f "$HOME/github-agent/.env" ]; then
  source "$HOME/github-agent/.env"
fi

send_telegram() {
  if [ ! -z "$TELEGRAM_BOT_TOKEN" ] && [ ! -z "$TELEGRAM_CHAT_ID" ]; then
    curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      -d "chat_id=$TELEGRAM_CHAT_ID" \
      -d "text=$1" \
      -d "parse_mode=Markdown" > /dev/null 2>&1
  fi
}

process_job() {
  local job_file="$1"
  local job_id=$(basename "$job_file" .json)
  
  echo "$(date): Processing $job_id" >> "$LOG_FILE"
  
  # Move to processing
  mv "$job_file" "$JOBS_DIR/processing/"
  
  # Run agent
  cd "$HOME/github-agent"
  if timeout 120 node agent/run.js "$job_id" >> "$LOG_FILE" 2>&1; then
    echo "$(date): Completed $job_id" >> "$LOG_FILE"
    
    # Send Telegram notification
    if [ -f "$JOBS_DIR/completed/$job_id.json" ]; then
      RESULT=$(cat "$JOBS_DIR/completed/$job_id.json" | grep -o '"result":"[^"]*"' | head -1 | cut -d'"' -f4)
      send_telegram "✅ *Job Completed*\n\nJob ID: \`$job_id\`\n\nResult:\n\`\`\`${RESULT:0:150}...\`\`\`"
    fi
    
    # Git commit
    git add -A
    git commit -m "Process job: $job_id" >> "$LOG_FILE" 2>&1
    git push >> "$LOG_FILE" 2>&1
  else
    echo "$(date): Failed $job_id" >> "$LOG_FILE"
    send_telegram "❌ *Job Failed*\n\nJob ID: \`$job_id\`"
  fi
}

# Main loop
while true; do
  # Process all pending jobs
  for job in "$JOBS_DIR"/pending/job-*.json; do
    if [ -f "$job" ]; then
      process_job "$job"
    fi
  done
  
  # Wait 5 seconds before checking again
  sleep 5
done
