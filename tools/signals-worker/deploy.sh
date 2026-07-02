#!/usr/bin/env bash
# Deploy the Signals pull-worker to the live host install and restart it.
#
#   ./tools/signals-worker/deploy.sh
#
# Copies the worker files from this repo checkout to $SIGNALS_WORKER_HOME
# (default ~/signals-worker), reinstalls deps only when package.json changed,
# records the deployed sha in $DEST/DEPLOYED, and kickstarts the launchd
# service. Scope is the pull-worker only — compose-server.mjs runs under its
# own launchd label and is deliberately not touched.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${SIGNALS_WORKER_HOME:-$HOME/signals-worker}"
LABEL="one.founderfirst.signals-worker"
LOG="$HOME/Library/Logs/founderfirst/signals-worker.log"
FILES=(index.mjs brain.mjs optimizer.mjs)

[ -d "$DEST" ] || { echo "live install not found at $DEST" >&2; exit 1; }

# Never ship a file that doesn't parse.
for f in "${FILES[@]}"; do node --check "$SRC/$f"; done
for f in "$SRC"/providers/*.mjs; do node --check "$f"; done

echo "deploying $SRC -> $DEST"
for f in "${FILES[@]}"; do install -m 0644 "$SRC/$f" "$DEST/$f"; done
mkdir -p "$DEST/providers"
install -m 0644 "$SRC"/providers/*.mjs "$DEST/providers/"

if ! diff -q "$SRC/package.json" "$DEST/package.json" >/dev/null 2>&1; then
  echo "package.json changed — installing deps"
  install -m 0644 "$SRC/package.json" "$DEST/package.json"
  (cd "$DEST" && npm install --omit=dev --no-audit --no-fund)
fi

SHA="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "$(date -u +%FT%TZ) $SHA" >> "$DEST/DEPLOYED"

launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "restarted $LABEL (sha $SHA)"
sleep 3
echo "--- last log lines ---"
tail -n 4 "$LOG" 2>/dev/null || echo "(no log at $LOG yet)"
