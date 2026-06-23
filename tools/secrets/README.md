# Secrets — how FounderFirst keeps API keys safe

**One master vault, deployed outward. Never in git.**

## The vault
`~/.config/founderfirst/secrets.env` — perms `600`, lives **outside** any repo, so
it cannot be committed. This is the single source of truth for every API key.

Read it with the helper (never `cat` it into a shared screen):
```bash
tools/secrets/ff-secret.sh list                 # all keys, masked
tools/secrets/ff-secret.sh get API_DIRECT_KEY   # one value (pipe to pbcopy)
tools/secrets/ff-secret.sh check                # warn on empty keys
```
To add or rotate a key, edit the vault file directly.

## Where each secret is deployed (the vault is the copy, not the runtime)

| Secret | Lives at runtime in | Used by |
|---|---|---|
| `API_DIRECT_KEY` | VM `tools/signals-worker/.env` | Signals poller (Reddit/X) |
| `SUPABASE_SERVICE_ROLE_KEY` | VM `tools/signals-worker/.env` | Signals worker DB access |
| `ANTHROPIC_API_KEY` | VM `tools/signals-worker/.env` | Lead drafting |
| `RESEND_API_KEY` | Supabase secret | Digest / notification emails |
| `LISTENING_INTAKE_SECRET` | Supabase secret | Extension + digest auth |

## Rules
1. Real secrets only ever live in: the vault, the VM `.env`, or Supabase/GitHub
   secret stores. **Never** in tracked files — `.gitignore` blocks `*.env`,
   `secrets.env`, `*.key`, `*.pem` (templates `*.env.example` stay allowed).
2. A key pasted into chat/email is considered exposed — rotate it once things work.
3. Deploy a key by copying from the vault to its runtime home; don't retype it.
