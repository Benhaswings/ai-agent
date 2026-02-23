#!/bin/bash
# Auto-restart GitHub Actions runner

RUNNER_DIR="$HOME/actions-runner"
LOG_FILE="$RUNNER_DIR/watchdog.log"

echo "$(date): Runner watchdog started" >> "$LOG_FILE"

while true; do
  # Check if runner is running
  if ! pgrep -f "Runner.Listener" > /dev/null; then
    echo "$(date): Runner not running, restarting..." >> "$LOG_FILE"
    
    cd "$RUNNER_DIR"
    nohup ./run.sh >> runner.log 2>&1 &
    
    sleep 5
    
    if pgrep -f "Runner.Listener" > /dev/null; then
      echo "$(date): Runner restarted successfully" >> "$LOG_FILE"
      
      # Send Telegram notification if configured
      if [ -f "$HOME/github-agent/.env" ]; then
        source "$HOME/github-agent/.env"
        if [ ! -z "$TELEGRAM_BOT_TOKEN" ] && [ ! -z "$TELEGRAM_CHAT_ID" ]; then
          curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
            -d "chat_id=$TELEGRAM_CHAT_ID" \
            -d "text=🔄 GitHub Runner was restarted automatically" \
            -d "parse_mode=Markdown" > /dev/null 2>&1
        fi
      fi
    else
      echo "$(date): Failed to restart runner" >> "$LOG_FILE"
    fi
  fi
  
  # Check every 10 seconds
  sleep 10
done
