#!/usr/bin/env bash
# loop-preflight.sh — static checks a BUILDER runs in its worktree BEFORE pushing.
# Catches the recurring bugs that otherwise only surface after a slow CI round-trip:
#   1. stale-tree trap (grepping the stale repo root instead of a fresh worktree)
#   2. migration-timestamp collisions (within-branch + vs origin/main)
#   3. pgTAP plan(N) != actual assertion count
#   4. non-hex UUID literals in fixtures (invalid input syntax for type uuid)
#   5. throws_ok() with a non-5-char SQLSTATE (matched as message, silently wrong)
# Usage: bash loop-preflight.sh <worktree-dir>
# Exit 0 = clean, 1 = problems found. Advisory — read every WARN.
set -uo pipefail
WT="${1:-.}"; cd "$WT" || { echo "FAIL: cannot cd $WT"; exit 1; }
fail=0; warn=0
say(){ printf '%s\n' "$*"; }
err(){ say "❌ $*"; fail=1; }
wrn(){ say "⚠️  $*"; warn=1; }

say "=== loop-preflight in $(pwd) ==="

# 1. STALE-TREE GUARD — these landed in Wave 1/2; absence means you're on a stale base.
[ -f apps/app/src/copy/strings.ts ] || err "strings.ts missing — you are on a STALE base, not a worktree off current main. Re-create the worktree off origin/main."
ls supabase/migrations/2026070[0-9]*_*.sql >/dev/null 2>&1 || err "no 2026-07 migrations present — STALE base. Branch off origin/main, not the repo root (it is on stale deploy-finish)."

# 2. MIGRATION TIMESTAMP COLLISIONS
dupes=$(ls supabase/migrations/*.sql 2>/dev/null | xargs -n1 basename 2>/dev/null | sed -E 's/^([0-9]{14})_.*/\1/' | sort | uniq -d)
[ -n "$dupes" ] && err "duplicate migration timestamps within branch: $dupes"
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  mainmax=$(git ls-tree -r --name-only origin/main supabase/migrations/ 2>/dev/null | grep -oE '[0-9]{14}' | sort | tail -1)
  yours=$(git diff --name-only origin/main -- 'supabase/migrations/*.sql' 2>/dev/null | grep -oE '[0-9]{14}')
  for t in $yours; do [ -n "$mainmax" ] && [ "$t" \< "$mainmax" -o "$t" = "$mainmax" ] && wrn "migration $t is <= main's max $mainmax — pick a later timestamp"; done
fi

# 3–5. pgTAP checks per changed test file
for f in $(git diff --name-only origin/main -- 'supabase/tests/*.sql' 2>/dev/null); do
  [ -f "$f" ] || continue
  # plan(N) vs assertion count
  plan=$(grep -oE 'plan\(\s*[0-9]+\s*\)' "$f" | grep -oE '[0-9]+' | head -1)
  if [ -n "$plan" ]; then
    asserts=$(grep -cE '\b(ok|is|isnt|is_deeply|throws_ok|lives_ok|throws_like|has_table|has_column|has_index|col_is_pk|results_eq|set_eq|cmp_ok|matches|alike)\s*\(' "$f")
    [ "$plan" != "$asserts" ] && wrn "$f: plan($plan) but ~$asserts assertion calls — reconcile (heuristic; count by hand if unsure)"
  fi
  # non-hex UUID literals (…-… blocks containing non-hex letters g-z)
  grep -oE "'[0-9a-fA-F]{0,8}-?[0-9a-zA-Z]*-?[0-9a-zA-Z]*-?[0-9a-zA-Z]*-?[0-9a-zA-Z]{0,12}'" "$f" 2>/dev/null \
    | grep -E "^'[0-9a-fA-F-]*[g-zG-Z]" | grep -E "'.{30,40}'" \
    | while read -r u; do wrn "$f: possible non-hex UUID literal $u (would raise 'invalid input syntax for type uuid')"; done
  # throws_ok with a non-5-char SQLSTATE as 2nd arg
  grep -oE "throws_ok\([^,]+,\s*'[a-z_]{6,}'" "$f" 2>/dev/null \
    | while read -r t; do wrn "$f: throws_ok uses a condition NAME, not a 5-char SQLSTATE — pgTAP matches it as the message, not the errcode. Use the numeric code (e.g. '23001')."; done
done

# 6. quick JS/TS sanity if package manager present (non-fatal hint)
say ""
[ "$fail" -eq 1 ] && say "PREFLIGHT: ❌ blocking issues above — FIX before pushing." && exit 1
[ "$warn" -eq 1 ] && say "PREFLIGHT: ⚠️  warnings above — verify each, then run tsc + vitest + the grep gates, then push." && exit 0
say "PREFLIGHT: ✅ static checks clean — still run tsc + vitest + grep gates before pushing (CI is the gate)."
exit 0
