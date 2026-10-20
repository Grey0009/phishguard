#!/usr/bin/env bash
# ==============================================================================
# PhishGuard — Stop Background Service (macOS & Linux)
# ==============================================================================

set -e

echo "Stopping PhishGuard background service..."

PIDS=$(lsof -ti:8000 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  kill -9 $PIDS 2>/dev/null || true
  echo "✓ Terminated PhishGuard engine listening on port 8000 (PID: $PIDS)."
else
  echo "PhishGuard engine is not running on port 8000."
fi

# Also clean up any orphan run.py processes
PYS=$(pgrep -f "backend/run.py" 2>/dev/null || true)
if [ -n "$PYS" ]; then
  kill -9 $PYS 2>/dev/null || true
  echo "✓ Terminated background run.py processes."
fi

echo "PhishGuard service stopped."
exit 0
