#!/usr/bin/env bash
# check-tokens.sh — SCAF-4 token-discipline enforcement
#
# Greps staged .jsx files (or, with --all, every .jsx file) for the four
# violation classes documented in demo/CLAUDE.md "Design token discipline":
#
#   1. Raw hex strings  in JSX inline styles  ->  use var(--ink), var(--white), etc.
#   2. Raw fontWeight   numbers               ->  use var(--fw-semibold), etc.
#   3. Raw borderRadius numbers               ->  use var(--r-card)/--r-card-emph/--r-pill,
#                                                 OR add `// radius-literal: <reason>`
#   4. position: fixed in JSX                 ->  use position: absolute (.phone is the
#                                                 positioning context); or, for off-screen
#                                                 utilities only, add `// token-exempt: <reason>`
#
# Usage:
#   bash scripts/check-tokens.sh           # check files staged for commit
#   bash scripts/check-tokens.sh --all     # check the whole tree (used by `npm run build`)
#
# Exit code: 0 = clean, 1 = violations found.

set -uo pipefail

# Resolve the demo directory regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DEMO_DIR"

MODE="${1:-staged}"

# Collect the file list.
if [ "$MODE" = "--all" ]; then
  FILES=$(find screens components -type f -name "*.jsx" 2>/dev/null)
else
  FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null \
          | grep -E "^(BookKeeping/demo/)?(screens|components)/.*\.jsx$" \
          | sed 's|^BookKeeping/demo/||' \
          || true)
fi

if [ -z "$FILES" ]; then
  exit 0
fi

# Filter that drops false-positives:
#   - lines containing the documented exemption tags
#   - JSDoc body lines (start with whitespace + `*`)
#   - JSX comment lines (`{/* ... */}`)
COMMENT_FILTER='radius-literal:|token-exempt:|:\s*\*|\{\s*/\*'

VIOLATIONS=0
REPORT=""

check_pattern() {
  local label="$1"
  local pattern="$2"
  local hint="$3"
  local hits
  hits=$(printf '%s\n' "$FILES" | xargs -I{} grep -HnE "$pattern" {} 2>/dev/null \
         | grep -vE "$COMMENT_FILTER" || true)
  if [ -n "$hits" ]; then
    REPORT+="\n[${label}] $hint\n${hits}\n"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

check_pattern \
  "raw hex" \
  "[\"']#[0-9a-fA-F]{3,8}[\"']" \
  "use var(--ink), var(--white), var(--paper) etc."

check_pattern \
  "raw fontWeight" \
  "fontWeight:\s*[0-9]" \
  "use var(--fw-semibold), var(--fw-bold) etc."

check_pattern \
  "raw borderRadius" \
  "borderRadius:\s*[0-9]" \
  "use var(--r-card)/--r-card-emph/--r-pill, OR add // radius-literal: <reason>"

check_pattern \
  "position: fixed" \
  "position:\s*[\"']?fixed" \
  "use position: absolute, OR add // token-exempt: <reason>"

if [ $VIOLATIONS -gt 0 ]; then
  printf 'SCAF-4 token-discipline check FAILED — %d violation class(es).\n' "$VIOLATIONS" >&2
  printf '%b\n' "$REPORT" >&2
  printf 'Fix the offending lines or add the documented exemption tag, then re-run.\n' >&2
  exit 1
fi

exit 0
