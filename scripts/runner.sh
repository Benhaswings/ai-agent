#!/bin/bash
# Manage GitHub Actions runner

RUNNER_DIR="$HOME/actions-runner"
PID_FILE="$RUNNER_DIR/runner.pid"

case "$1" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
      echo "Runner already running (PID: $(cat $PID_FILE))"
      exit 0
    fi
    echo "Starting runner..."
    cd "$RUNNER_DIR"
    nohup ./run.sh > runner.log 2>&1 &
    echo $! > "$PID_FILE"
    echo "Runner started (PID: $!)"
    ;;
  stop)
    if [ -f "$PID_FILE" ]; then
      kill "$(cat $PID_FILE)" 2>/dev/null && echo "Runner stopped"
      rm -f "$PID_FILE"
    else
      echo "Runner not running"
    fi
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
      echo "Runner running (PID: $(cat $PID_FILE))"
    else
      echo "Runner not running"
    fi
    ;;
  logs)
    tail -f "$RUNNER_DIR/runner.log"
    ;;
  *)
    echo "Usage: $0 {start|stop|status|logs}"
    exit 1
    ;;
esac
