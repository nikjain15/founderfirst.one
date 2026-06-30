# [stress:auth] Auth, session & routing — findings

**Feature #9 · TAG=AUTHTEST · Wave 2.** Black-box adversarial test of the auth/session/
routing layer in `apps/app` against **live prod** (`ejqsfzggyfsjzrcevlnq`), plus client-code
review. Assume broken until proven.

## What we crashed

**Nothing at the security boundary.** Every attempt to make the SPA trust a client-supplied
identity — forged tokens, alg-confusion, payload tampering, cross-tenant reads, replayed and
mis-addressed magic links, off-domain redirects — was **rejected by the server**, and the SPA
leaked no tenant data in any case. The core design claim holds: *routing/rendering is
cosmetic; all authorization is the verified JWT + Postgres RLS + the edge-fn write-path.*

What we **did** find were five **client-side UX / robustness papercuts** (all LOW/INFO, no
data exposure) — fixed in this PR. No server, migration, or config change was needed; the
GoTrue config (ES256 asymmetric JWTs, redirect allow-list, one-time OTP, rate limiting) is
correctly hardened and is left untouched.

---

## Security battery — results (live prod evidence)

| # | Attack | Result | Evidence |
|---|---|---|---|
| S1 | Read with **real** JWT (user A) | **PASS** — sees only own org | `organizations` → 1 row (`[AUTHTEST] Org A`) |
| S2 | **Cross-tenant** read: A requests Org B by id | **PASS** — `[]` | `organizations?id=eq.<orgB>` under A → `[]` |
| S3 | Forged **alg=none** (sub=A) vs PostgREST | **PASS** — 401 | `"Wrong or unsupported encoding algorithm"` |
| S4 | Forged **HS256** (alg-confusion, sub=A) | **PASS** — 401 | `"No suitable key or wrong key type"` |
| S5 | **Tampered payload** (swapped sub, real signature) | **PASS** — 401 | signature check fails |
| S6 | Garbage / malformed token | **PASS** — 401 | `"JWT cryptographic operation failed"` |
| S7 | **No token** (anon apikey only) | **PASS** — 200 but **0 rows** | RLS denies anon |
| S8 | Forged alg=none vs **edge fn** (`orgs`) | **PASS** — 401 | write-path rejects |
| S9 | Forged alg=none vs **`is_platform_staff`** RPC | **PASS** — 401 | `expected 'alg' was not 'none'` |
| S10 | `is_platform_staff` as **real non-staff** user | **PASS** — `false` | staff status is server-derived |
| S11 | Magic-link **replay** (one-time use) | **PASS** — 1st OK, 2nd 403 | `otp_expired` on replay |
| S12 | Magic-link for a **different email** | **PASS** — 403 | token bound to issued email |
| S13 | **Rate limit** OTP send (6× rapid) | **PASS** — 1×200 then 429×5 | server-enforced |
| S14 | **Open-redirect** via `email_redirect_to=evil.com` | **PASS** — falls back to allow-listed domain | action_link → `founderfirst.one`, not evil.com |
| S15 | Inject **another user's real token** | **PASS** (by design) | you simply *are* that user; no privilege gain — a forged one (S3–S6) gets nothing |

> The SPA holds the session in `localStorage`, but `AuthProvider` only reads "is there a
> session" for routing (`apps/app/src/auth/AuthProvider.tsx:37`). Authorization is never
> derived client-side (`ARCHITECTURE.md §4`: *role/tenant from the verified session, never
> the client*). Tampering with `localStorage` therefore changes which **component** renders,
> never which **data** is returned — proven by S1–S9.

**Tokens are ES256 (asymmetric, JWKS/kid).** Forging requires the private signing key, which
is not in the client. This is why alg=none and HS256 confusion both fail.

---

## Client-side findings (fixed in this PR)

All LOW/INFO. None expose data; they are correctness/UX hardening.

### F1 — `/login` is shown to already-authenticated users (LOW, UX)
`apps/app/src/App.tsx:53` routes `/login` straight to `<Login />` with no
redirect-if-authed. A signed-in user hitting `/login` sees the form and can fire a pointless
new magic link.
**Fix:** `LoginRoute` wrapper redirects authed users to their return path (or `/`).

### F2 — return path lost on deep-link redirect (LOW, UX)
`RequireAuth` (`App.tsx:19`) bounces an unauthenticated deep-link (e.g. `/staff`) to
`/login`, but the magic link always returns the user to `BASE_URL` (`/`), so the originally
requested page is forgotten.
**Fix:** stash `ff.returnTo` on redirect; consume it once a session exists (works for both
the manual `/login` path and the magic-link-lands-on-`/` path).

### F3 — pending-invite token re-inserted into URL unencoded (LOW, robustness)
`apps/app/src/routes/Home.tsx:24` builds ``/accept?token=${pending}`` from a `localStorage`
value with no `encodeURIComponent`. A token containing `&`/`#`/space would corrupt the query
and silently break invite resume.
**Fix:** `encodeURIComponent(pending)`.

### F4 — login email not trimmed (LOW, UX)
`apps/app/src/routes/Login.tsx:24` sends the raw input. A stray leading/trailing space yields
"no link received" with no feedback (native `type=email` already blocks most malformed
input, but not all whitespace cases consistently).
**Fix:** `.trim()` the email before `signInWithOtp`.

### F5 — stale UI shell after sign-out + bfcache back-button (INFO, defense-in-depth)
After `signOut`, a browser **back** that restores the page from bfcache does **not** remount
React, so the in-memory `session` can briefly render the authed shell. **No data leaks** (the
refresh token is revoked; every query 401s), but it's a confusing flash.
**Fix:** a `pageshow` (`event.persisted`) listener in `AuthProvider` re-syncs `getSession()`
on bfcache restore.

---

## Confirmed-correct (no change needed)
- `StaffRoute` distinguishes a failed access check from "not staff" (`App.tsx:33`) — a
  transient RPC error shows a retry wall, not a false "Staff only".
- `Accept` stashes the invite token and bounces unauthenticated users to login, then resumes
  (`routes/Accept.tsx` + `Home.tsx` resume effect); `ran.current` prevents double-accept.
- `basename` derivation is correct for both `/` and legacy `/app/` builds (`App.tsx:87`).
- `hasSupabase=false` degrades gracefully ("Sign-in isn't configured"); no crash anywhere.
- Edge-fn write-path and all `staff_*` RPCs are self-gating server-side (S8–S10).

## Flag for integrator
- **No server/migration/edge-fn/config change in this PR.** GoTrue config verified healthy
  (ES256 keys, redirect allow-list enforced, one-time OTP, OTP rate limit). Leave as-is.
- Files touched are **app-local** (`App.tsx`, `AuthProvider.tsx`, `Login.tsx`, `Home.tsx`) —
  not shared ledger/styles/migration files, so low merge-collision risk.
