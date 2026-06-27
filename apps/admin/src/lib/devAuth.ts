/**
 * Dev / E2E auto-login — lets a developer (or an automated agent / CI E2E run)
 * drive the auth-gated admin without a magic link.
 *
 * It performs a REAL email+password sign-in, so the resulting session carries a
 * real JWT and every RPC + edge function works against real data — unlike the
 * offline CONTENT_MOCK, which only stubs the content editor.
 *
 * SECURITY — three independent guards, all must be true:
 *   1. import.meta.env.DEV   (local `vite dev`)   OR   VITE_E2E === "1"
 *      (an explicit E2E build — never set by the Pages/prod workflow), AND
 *   2. VITE_DEV_ADMIN_EMAIL is set, AND
 *   3. VITE_DEV_ADMIN_PASSWORD is set.
 * A normal production build sets none of these, so this whole path is dead code
 * and tree-shaken out. The credentials live only in local .env.local
 * (gitignored) or CI secrets — never committed. Use a throwaway test admin,
 * not a real person's account.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL = import.meta.env.VITE_DEV_ADMIN_EMAIL as string | undefined;
const PASSWORD = import.meta.env.VITE_DEV_ADMIN_PASSWORD as string | undefined;
const CHANNEL_OPEN = import.meta.env.DEV || import.meta.env.VITE_E2E === "1";

/** True only when auto-login is permitted AND credentials are present. */
export const DEV_AUTO_LOGIN = CHANNEL_OPEN && !!EMAIL && !!PASSWORD;

/**
 * Attempt the dev/E2E sign-in. Returns true if a sign-in request was issued
 * (the SIGNED_IN listener in App then validates admin + sets the session).
 * No-op + false when disabled or if it fails.
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
