#!/usr/bin/env bash
# Build the Penny demo, sync dist into penny/demo/, commit, and push.
#
# Accepts the commit message via either invocation style:
#   npm run deploy --msg="text"        # npm sets npm_config_msg
#   npm run deploy -- --msg="text"     # passed as positional arg
#   npm run deploy                     # falls back to "update"
set -euo pipefail

msg=""
for arg in "$@"; do
  case "$arg" in
    --msg=*) msg="${arg#--msg=}" ;;
  esac
done
if [ -z "$msg" ] && [ -n "${npm_config_msg:-}" ]; then
  msg="$npm_config_msg"
fi
if [ -z "$msg" ]; then
  msg="update"
fi

vite build
cd ../..
rsync -av --delete BookKeeping/demo/dist/ penny/demo/
git add penny/demo/
git commit -m "deploy: ${msg}"
git push origin main
