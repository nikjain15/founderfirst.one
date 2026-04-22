#!/usr/bin/env bash
set -uo pipefail

RESULTS_DIR="test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$RESULTS_DIR"

SCRIPTS=("load-test.js" "quality-audit.js" "edge-cases.js" "rate-limit.js")
NAMES=("load-test" "quality-audit" "edge-cases" "rate-limit")
STATUSES=()

for i in "${!SCRIPTS[@]}"; do
  script="${SCRIPTS[$i]}"
  name="${NAMES[$i]}"
  log="$RESULTS_DIR/${TIMESTAMP}_${name}.log"
  echo "==> Running $script ..."
  if node "$script" 2>&1 | tee "$log"; then
    STATUSES+=("PASSED")
  else
    STATUSES+=("FAILED")
  fi
  echo ""
done

echo "=============================="
echo "  RESULTS SUMMARY"
echo "=============================="
for i in "${!NAMES[@]}"; do
  printf "  %-20s %s\n" "${NAMES[$i]}" "${STATUSES[$i]}"
done
echo "=============================="
echo "Logs saved to: $RESULTS_DIR/"

open "$RESULTS_DIR" 2>/dev/null || true
