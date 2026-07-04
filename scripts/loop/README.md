# Autonomous build loop — durable (launchd) runner

Runs the FounderFirst build loop on Nik's Mac **independent of any open Claude Code app** —
survives app-close and Mac-sleep (`caffeinate` keeps it awake per-iteration, no sudo). Each
iteration is one Claude Code session on the subscription that claims ONE backlog card, builds
it off `origin/main`, verifies CI green, and opens a PR.

## Files
- `run-loop.sh` — one iteration (single-flighted via an atomic mkdir lock — macOS has no `flock(1)`; keeps Mac awake with `caffeinate`).
- `MODE` — one word: `safe` (default) or `deploy`.
  - **safe** — build + red-team + open GREEN PRs only. NEVER merges/deploys. Worst case while
    you're away: some PRs waiting for review.
  - **deploy** — ALSO auto-merge + deploy PRs once CI-green AND red-teamed (P0=0), stop-and-report
    on any P0/red/decision. Flip by `echo deploy > scripts/loop/MODE` (no reinstall).
- `com.founderfirst.build-loop.plist` — launchd job (RunAtLoad + every 30 min).


## Prerequisite — headless subscription auth (one-time)
The loop's claude sessions run under launchd, which CANNOT read the interactive Keychain login,
and `secrets.env`'s `ANTHROPIC_API_KEY` is deliberately unset by `run-loop.sh` (spend policy:
subscription-only, never the metered API). Headless auth therefore needs a long-lived
subscription OAuth token:

```bash
claude setup-token           # browser OAuth, approve once; prints sk-ant-oat01-...
echo 'CLAUDE_CODE_OAUTH_TOKEN=<paste-token>' >> ~/.config/founderfirst/secrets.env
```
`run-loop.sh` sources `secrets.env` with `set -a`, so the token is exported to each iteration
and the CLI uses the subscription. Without it every iteration dies with a 401.

## Install (Nik runs these once, at the machine)
```bash
chmod +x "scripts/loop/run-loop.sh"
cp "scripts/loop/com.founderfirst.build-loop.plist" ~/Library/LaunchAgents/
launchctl load  ~/Library/LaunchAgents/com.founderfirst.build-loop.plist   # start
# test one iteration immediately:
launchctl start com.founderfirst.build-loop
tail -f ~/Library/Logs/founderfirst/build-loop.log
```
Stop / uninstall:
```bash
launchctl unload ~/Library/LaunchAgents/com.founderfirst.build-loop.plist
```

## Before trusting it unattended
Run ONE iteration with `tail -f` (above) and confirm it: picks a card, builds off `origin/main`,
opens a green PR, and exits without archiving the session. Only switch `MODE` to `deploy` after a
clean safe-mode run — an unattended loop that ships to prod is high-leverage and high-risk.

## Logs
`~/Library/Logs/founderfirst/build-loop.log` (iteration output) · `.out` / `.err` (launchd).
