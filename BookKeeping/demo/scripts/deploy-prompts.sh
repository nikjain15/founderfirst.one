#!/usr/bin/env bash
# Sync demo prompts into penny/demo/prompts/, commit, and push.
#
# Accepts the commit message via either invocation style:
#   npm run deploy:prompts --msg="text"        # npm sets npm_config_msg
#   npm run deploy:prompts -- --msg="text"     # passed as positional arg
#   npm run deploy:prompts                     # falls back to "update"
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

cd ../..
rsync -av BookKeeping/demo/public/prompts/ penny/demo/prompts/
git add penny/demo/prompts/
git commit -m "deploy: prompts - ${msg}"
git push origin main
