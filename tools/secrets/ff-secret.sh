#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# ff-secret — read the FounderFirst local secrets vault.
#
# Vault:  ~/.config/founderfirst/secrets.env   (perms 600, OUTSIDE any git repo)
# This script only READS it. Edit the vault directly to add/rotate a key.
#
#   ff-secret list           # all keys, values masked
#   ff-secret get  KEY       # print one value (for piping; e.g. pbcopy)
#   ff-secret check          # warn on any empty key
#
# Tip: copy a key to the clipboard:  ./ff-secret.sh get API_DIRECT_KEY | pbcopy
# -----------------------------------------------------------------------------
set -euo pipefail
VAULT="${FF_VAULT:-$HOME/.config/founderfirst/secrets.env}"
[ -f "$VAULT" ] || { echo "ff-secret: no vault at $VAULT" >&2; exit 1; }

case "${1:-list}" in
  list)
    awk -F= '/^[A-Z_]+=/{v=$2; print $1"="(v==""?"(empty)":substr(v,1,6)"\xe2\x80\xa6 ("length(v)" chars)")}' "$VAULT"
    ;;
  get)
    key="${2:?usage: ff-secret get KEY}"
    line="$(grep -E "^${key}=" "$VAULT" || true)"
    [ -n "$line" ] || { echo "ff-secret: $key not in vault" >&2; exit 1; }
    printf '%s' "${line#*=}"
    ;;
  check)
    miss=0
    while IFS='=' read -r k v; do
      case "$k" in [A-Z_]*) [ -z "$v" ] && { echo "empty: $k"; miss=1; } ;; esac
    done < "$VAULT"
    [ "$miss" -eq 0 ] && echo "all keys set" || exit 1
    ;;
  *) echo "usage: ff-secret {list|get KEY|check}" >&2; exit 1 ;;
esac
