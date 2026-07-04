#!/bin/bash
# FounderFirst autonomous build loop — one iteration.
# Runs a single Claude Code session (on Nik's subscription) that claims ONE backlog
# card, builds it in a worktree off origin/main, verifies CI green, and opens a PR.
# launchd relaunches this on a timer (see the plist). Survives app-close / Mac-sleep.
#
# MODE is controlled by scripts/loop/MODE (one word):
#   safe   -> build + red-team + open GREEN PRs only; NEVER merge/deploy (default)
#   deploy -> ALSO auto-merge + deploy PRs once CI-green AND red-teamed (P0=0)
# Flip mode by editing scripts/loop/MODE; no reinstall needed.
set -uo pipefail

REPO="/Users/nikjain/Documents/FounderFirst_Building Products"
LOG_DIR="$HOME/Library/Logs/founderfirst"
LOCK="$LOG_DIR/build-loop.lock"
MODE_FILE="$REPO/scripts/loop/MODE"
mkdir -p "$LOG_DIR"

# Single-flight: never run two iterations at once (avoids double-claiming a card).
# macOS has no flock(1); use an atomic mkdir lock with a stale-lock sweep (>2h = dead).
LOCKDIR="$LOG_DIR/build-loop.lock.d"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  if [ -d "$LOCKDIR" ] && [ "$(find "$LOCKDIR" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
    rmdir "$LOCKDIR" 2>/dev/null; mkdir "$LOCKDIR" 2>/dev/null || { echo "$(date '+%F %T') lock contended; skip" >>"$LOG_DIR/build-loop.log"; exit 0; }
  else
    echo "$(date '+%F %T') another iteration is running; skip" >>"$LOG_DIR/build-loop.log"; exit 0
  fi
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

cd "$REPO" || exit 1
# Secrets (SUPABASE_ACCESS_TOKEN, service role, provider keys, LOOP_HEARTBEAT_TOKEN, ...)
set -a; . "$HOME/.config/founderfirst/secrets.env" 2>/dev/null; set +a
# Spend policy (LOOP_PROMPT rule 11): subscription-only. secrets.env carries an
# ANTHROPIC_API_KEY for other services; it must NEVER auth the loop's claude
# sessions (metered API). Unset so the CLI falls back to the subscription login.
unset ANTHROPIC_API_KEY
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/Library/pnpm:$PATH"

MODE="$(tr -d '[:space:]' < "$MODE_FILE" 2>/dev/null || echo safe)"

# Keep the Mac awake for the duration of THIS iteration only (no sudo needed).
caffeinate -dimsu -w $$ &

MODE_RULES="SAFE MODE: build + red-team + open a GREEN PR only. Do NOT merge, do NOT deploy, do NOT touch prod. Leave the PR for Nik."
if [ "$MODE" = "deploy" ]; then
  MODE_RULES="DEPLOY MODE (Nik-authorized): after the PR is CI-GREEN and red-teamed with ZERO P0, you MAY admin-merge it and deploy (migrations via Supabase Management API THEN edge fns, then verify live per LEARNINGS). STOP-AND-REPORT on any P0, red CI, ambiguity, or product decision-needed — never force it."
fi

TS="$(date '+%F %T')"
echo "===== $TS  iteration start (mode=$MODE) =====" >>"$LOG_DIR/build-loop.log"

claude -p "You are the FounderFirst build-loop orchestrator, ONE iteration. Read docs/plans/LOOP_PROMPT.md, CLAUDE.md, LEARNINGS.md, docs/plans/BACKLOG.md.

Pick the TOP unclaimed card in docs/plans/BACKLOG.md whose blocked-by is clear and that has NO decision-needed marker. If none qualify, log 'no buildable cards' and exit cleanly (do nothing else). Otherwise:
- worktree OFF fresh origin/main (git fetch first; deploy-finish is STALE), branch loop/<card>.
- build it + tests, follow the usability + centralization gates, run scripts/loop-preflight.sh, verify CI GREEN before reporting (never trust 'running'; watch tee-without-pipefail false-greens).
- open ONE PR against main.
- NEVER call archive_session. Heartbeat loop_runs if available. Exit by PR or a blocked-report; no immortal session.
$MODE_RULES" \
  --permission-mode bypassPermissions \
  --dangerously-skip-permissions \
  >>"$LOG_DIR/build-loop.log" 2>&1

echo "===== $(date '+%F %T')  iteration end (exit $?) =====" >>"$LOG_DIR/build-loop.log"
