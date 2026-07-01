/**
 * Dev / E2E auto-login for the Penny app — lets CI (or a developer) drive the
 * auth-gated app without a magic link. Mirrors apps/admin/src/lib/devAuth.ts.
 *
 * It performs a REAL email+password sign-in, so the session carries a real JWT and
 * every RPC + edge function works against real data.
 *
 * SECURITY — three independent guards, all must hold:
 *   1. import.meta.env.DEV (local `vite dev`)  OR  VITE_E2E === "1"
 *      (an explicit E2E build — never set by the Pages/prod workflow), AND
 *   2. VITE_DEV_APP_EMAIL is set, AND
 *   3. VITE_DEV_APP_PASSWORD is set.
 * A normal production build sets none of these, so this whole path is dead code
 * and tree-shaken out. Credentials live only in CI secrets / local .env.local
 * (gitignored) — never committed. Use a throwaway test user, not a real person.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL = import.meta.env.VITE_DEV_APP_EMAIL as string | undefined;
const PASSWORD = import.meta.env.VITE_DEV_APP_PASSWORD as string | undefined;
const CHANNEL_OPEN = import.meta.env.DEV || import.meta.env.VITE_E2E === "1";

/** True only when auto-login is permitted AND credentials are present. */
export const DEV_AUTO_LOGIN = CHANNEL_OPEN && !!EMAIL && !!PASSWORD;

/**
 * Attempt the dev/E2E sign-in. Returns true if a sign-in request was issued
 * (the onAuthStateChange listener then sets the session). No-op + false when
 * disabled or if it fails.
 */
export async function devAutoSignIn(db: SupabaseClient): Promise<boolean> {
  if (!DEV_AUTO_LOGIN) return false;
  const { error } = await db.auth.signInWithPassword({ email: EMAIL!, password: PASSWORD! });
  if (error) {
    console.warn("[devAuth] auto sign-in failed:", error.message);
    return false;
  }
  console.info("[devAuth] auto-signed in as", EMAIL);
  return true;
}
