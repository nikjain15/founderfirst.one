# CLAUDE.md

This repository's contributor and agent guidance lives in [AGENTS.md](AGENTS.md).
Read it for setup, testing, conventions, project structure, and PR rules.

## Notes for Claude Code

- This is a pnpm 9 workspace. Use `pnpm --filter <name>` to target one package (for example `pnpm --filter @ff/app test`).
- Database tests need a local Supabase stack: run `supabase db start`, then `supabase test db`.
- Before merging, run the full regression suite documented under Testing in AGENTS.md; `main` is protected and every gate must pass.
