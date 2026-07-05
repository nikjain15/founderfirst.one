/**
 * e2e-lib/mintSession.mjs — captcha-EXEMPT E2E auth for the app + admin harnesses.
 *
 * WHY THIS EXISTS
 * Server-side Turnstile captcha (SEC-2) is now enabled on the Supabase project, so
 * `auth.signInWithPassword` — what the old dev-auth shim (each app's lib/devAuth.ts)
 * called at app boot — is rejected with 400 "captcha protection: request disallowed"
 * unless a Turnstile token accompanies it. CI has no browser-solved token, so every
 * PR's app-e2e + admin-e2e died on the login wall.
 *
 * In prod NO real user signs in with a password anyway (the app is passwordless OTP +
 * Turnstile). So the fix is CI-side: mint a session for the throwaway E2E account via
 * the service-role admin API, which BYPASSES captcha, and inject it into the browser
 * before the app boots. The real login flow (OTP + Turnstile) is untouched.
 *
 * MECHANISM (node-only — the service-role key never reaches the client bundle):
 *   1. service-role client → auth.admin.generateLink({ type: 'magiclink', email })
 *      returns properties.hashed_token (a.k.a. token_hash). Service-role, so no captcha.
 *   2. Exchange that token_hash for a real session at the GoTrue verify endpoint
 *      (POST /auth/v1/verify {type,token_hash}) — the anon `verify` path takes NO
 *      captcha. Yields access_token + refresh_token + user.
 *   3. The caller injects { session } into the page via page.addInitScript, writing
 *      the supabase-js storage key `sb-<ref>-auth-token` BEFORE any app script runs,
 *      so getClient() finds an existing session and renders authed — no sign-in call.
 *
 * SECURITY: E2E_SERVICE_ROLE_KEY is read from the environment of the NODE harness
 * step only (see .github/workflows/app-e2e.yml + e2e.yml). It is NOT a VITE_ var, so
 * it is never bundled into apps/app or apps/admin. This module runs only in node.
 */
import { createClient } from "@supabase/supabase-js";

/** Derive the supabase-js localStorage key + a session object to inject.
 *  Returns { ref, storageKey, session } or throws with an actionable message. */
export async function mintE2ESession({ supabaseUrl, anonKey, serviceRoleKey, email }) {
  if (!supabaseUrl) throw new Error("mintE2ESession: SUPABASE URL missing (VITE_SUPABASE_URL not wired into the run step)");
  if (!anonKey) throw new Error("mintE2ESession: anon key missing (VITE_SUPABASE_ANON_KEY not wired into the run step)");
  if (!serviceRoleKey) throw new Error("mintE2ESession: E2E_SERVICE_ROLE_KEY missing (add it as an Actions secret + wire it into the run step)");
  if (!email) throw new Error("mintE2ESession: E2E account email missing (E2E_APP_EMAIL / E2E_ADMIN_EMAIL)");

  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  const storageKey = `sb-${ref}-auth-token`;

  // 1) Service-role generateLink — bypasses captcha, mints a magiclink token_hash.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw new Error(`mintE2ESession: generateLink failed — ${linkErr.message} (is ${email} a real user on this project?)`);
  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) throw new Error("mintE2ESession: generateLink returned no hashed_token");

  // 2) Exchange token_hash → session at the anon verify endpoint (no captcha on verify).
  const resp = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`mintE2ESession: verify exchange failed (status ${resp.status}): ${body.slice(0, 200)}`);
  }
  const s = await resp.json();
  if (!s?.access_token || !s?.refresh_token) {
    throw new Error(`mintE2ESession: verify returned no tokens: ${JSON.stringify(s).slice(0, 200)}`);
  }

  // 3) Build the supabase-js persisted-session shape (v2 storage format).
  const expiresAt = s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600);
  const session = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    token_type: s.token_type ?? "bearer",
    expires_in: s.expires_in ?? 3600,
    expires_at: expiresAt,
    user: s.user ?? null,
  };
  return { ref, storageKey, session };
}

/** Inject the minted session into the page so supabase-js finds it at boot.
 *  MUST be called before page.goto() — addInitScript runs before app scripts.
 *  Writes the storage key on BOTH the target origin and about:blank navigations. */
export async function injectSession(page, { storageKey, session }) {
  await page.addInitScript(
    ([key, value]) => {
      try { window.localStorage.setItem(key, value); } catch { /* storage may be blocked pre-nav */ }
    },
    [storageKey, JSON.stringify({ ...session, storageKey })],
  );
}
