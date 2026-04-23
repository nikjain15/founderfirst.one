# Deploy Guide — Penny Demo

## Key facts

| What | Value |
|---|---|
| **GitHub repo** | https://github.com/nikjain15/founderfirst.one |
| **Live URL** | https://founderfirst.one/penny/demo/ |
| **Hosting** | GitHub Pages — auto-deploys on every push to `main` |
| **Branch** | `main` |
| **Git root** | `FounderFirst_Building Products/` (the workspace root folder) |
| **Source** | `BookKeeping/demo/` — React + Vite. Edit this. |
| **Deployed output** | `penny/demo/` — pre-built files. Always synced from `dist/`. |

---

## How it works

```
Edit source           Build              Sync              Push
BookKeeping/demo/ → npm run build → dist/ → penny/demo/ → GitHub Pages
```

GitHub Pages serves everything in `penny/demo/` on the `main` branch directly as static files. There is no CI build step — you build locally and push the output.

---

## One-time setup (fresh machine)

### 1. Check SSH access to GitHub

```bash
ssh -T git@github.com
# Expected: "Hi nikjain15! You've successfully authenticated..."
```

If this fails, add your SSH key:
```bash
ssh-add ~/.ssh/id_ed25519   # or id_rsa — whatever key you have
```

If you don't have an SSH key yet, generate one:
```bash
ssh-keygen -t ed25519 -C "your@email.com"
# Then add ~/.ssh/id_ed25519.pub to https://github.com/settings/keys
```

### 2. Initialize the local repo

Run from the workspace root (`FounderFirst_Building Products/`):

```bash
cd "FounderFirst_Building Products"

git init
git remote add origin git@github.com:nikjain15/founderfirst.one.git
git fetch origin main
git checkout origin/main -- .
git branch -M main
```

### 3. Install demo dependencies

```bash
cd BookKeeping/demo
npm install
cd ../..
```

You're ready. Test the dev server:
```bash
cd BookKeeping/demo && npm run dev
# Opens at http://localhost:5173
```

---

## Deploy after every change

All `git` commands run from **`FounderFirst_Building Products/`** (the workspace root).
All `npm` commands run from **`BookKeeping/demo/`**.

### Step 1 — Build

```bash
cd BookKeeping/demo
npm run build
cd ../..
```

Output: `BookKeeping/demo/dist/`

### Step 2 — Sync to the git tree

```bash
rsync -av --delete \
  BookKeeping/demo/dist/ \
  penny/demo/
```

`--delete` removes stale hashed asset files from old builds so they don't pile up.

### Step 3 — Commit and push

```bash
git add penny/demo/
git commit -m "deploy: <short description of what changed>"
git push origin main
```

**Live at https://founderfirst.one/penny/demo/ within ~30 seconds.**

Check deploy status: https://github.com/nikjain15/founderfirst.one/actions

---

## Quick one-liner (copy-paste after any change)

```bash
cd "/Users/nikjain/Documents/FounderFirst_Building Products/BookKeeping/demo" && npm run build && cd .. && cd .. && rsync -av --delete BookKeeping/demo/dist/ penny/demo/ && git add penny/demo/ && git commit -m "deploy: update penny demo" && git push origin main
```

---

## What lives where

```
FounderFirst_Building Products/     ← git root — run git commands here
│
├── BookKeeping/demo/               ← source — run npm commands here
│   ├── screens/                    ← React screen components (.jsx)
│   ├── public/
│   │   ├── prompts/                ← AI prompt markdown files
│   │   └── config/                 ← scenarios.json, industries.json, personas.json
│   ├── styles/                     ← CSS tokens and component styles
│   ├── dist/                       ← build output (gitignored — never commit this)
│   └── vite.config.js              ← base: "/penny/demo/"
│
└── penny/demo/                     ← deployed output — synced from dist/
    ├── assets/                     ← hashed JS + CSS bundles
    ├── prompts/                    ← copied from public/prompts/
    ├── config/                     ← copied from public/config/
    └── index.html
```

**Rule:** never commit anything inside `BookKeeping/demo/` to git. Only `penny/demo/` (the built output) gets committed.

---

## Prompt or config changes only

If you only edited a file in `public/prompts/` or `public/config/` (no JS/JSX changes), you still need a full build — Vite copies `public/` into `dist/` on every build.

---

## Verify before pushing

```bash
cd BookKeeping/demo
npm run preview   # serves the built dist/ at localhost:4173
```

This is identical to what GitHub Pages serves. Confirm the change looks right before pushing.

---

## Troubleshooting

**Push rejected — "fetch first" or "non-fast-forward"**
```bash
git fetch origin main
git rebase origin/main
git push origin main
```

**SSH auth fails on push**
```bash
ssh -T git@github.com          # verify SSH works
git remote -v                  # verify remote is SSH, not HTTPS
# Should show: git@github.com:nikjain15/founderfirst.one.git
# If it shows https://, fix it:
git remote set-url origin git@github.com:nikjain15/founderfirst.one.git
```

**Site not updating after push**
- Check https://github.com/nikjain15/founderfirst.one/actions — Pages deploys in ~30s
- Hard-refresh the browser (`Cmd+Shift+R`) to bypass cache

**Dev server shows old AI responses**
Responses are cached in `localStorage`. Open DevTools → Application → Local Storage → clear `penny-demo-state-v5` and reload.
