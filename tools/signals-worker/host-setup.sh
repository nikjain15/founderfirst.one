#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# host-setup.sh — bring the Signals worker up on the Mac host via launchd.
#
# Reads keys from the vault (~/.config/founderfirst/secrets.env), writes a local
# .env, installs deps, and installs+starts a launchd agent that runs the worker
# continuously (restarts on crash, survives logout). Re-run to apply changes.
#
# Prereqs: Ollama running on the host with the score + embed models pulled,
# and the vault populated (API_DIRECT_KEY, SUPABASE_SERVICE_ROLE_KEY,
# ANTHROPIC_API_KEY). Run from the worker dir:  bash host-setup.sh
# -----------------------------------------------------------------------------
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT="${FF_VAULT:-$HOME/.config/founderfirst/secrets.env}"
LABEL="com.founderfirst.signals-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/founderfirst"
NODE_BIN="$(command -v node)"

[ -f "$VAULT" ] || { echo "no vault at $VAULT — create it first"; exit 1; }
vget() { grep -E "^$1=" "$VAULT" | head -1 | cut -d= -f2-; }

API_DIRECT_KEY="$(vget API_DIRECT_KEY)"
SERVICE_KEY="$(vget SUPABASE_SERVICE_ROLE_KEY)"
ANTHROPIC_KEY="$(vget ANTHROPIC_API_KEY)"

missing=""
[ -z "$API_DIRECT_KEY" ] && missing="$missing API_DIRECT_KEY"
[ -z "$SERVICE_KEY" ]    && missing="$missing SUPABASE_SERVICE_ROLE_KEY"
[ -z "$ANTHROPIC_KEY" ]  && missing="$missing ANTHROPIC_API_KEY"
if [ -n "$missing" ]; then
  echo "Vault is missing:$missing"
  echo "Add them to $VAULT and re-run."
  exit 1
fi

# 1. Write the worker .env (gitignored).
cat > "$WORKER_DIR/.env" <<EOF
SUPABASE_URL=https://ejqsfzggyfsjzrcevlnq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_SCORE_MODEL=qwen2.5:7b-instruct-q4_K_M
ANTHROPIC_API_KEY=$ANTHROPIC_KEY
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
API_DIRECT_KEY=$API_DIRECT_KEY
APIDIRECT_BASE=https://apidirect.io/v1
BATCH=20
PAGES_PER_POLL=2
POLL_INTERVAL_SECONDS=60
EOF
chmod 600 "$WORKER_DIR/.env"
echo "wrote $WORKER_DIR/.env (600)"

# 2. Install deps.
( cd "$WORKER_DIR" && npm install --omit=dev --no-audit --no-fund )

# 3. launchd agent.
mkdir -p "$LOG_DIR"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE_BIN</string><string>$WORKER_DIR/index.mjs</string></array>
  <key>WorkingDirectory</key><string>$WORKER_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/signals-worker.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/signals-worker.err</string>
</dict></plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "loaded launchd agent $LABEL"
echo "logs: tail -f $LOG_DIR/signals-worker.log"
