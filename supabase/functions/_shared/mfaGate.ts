/**
 * mfaGate — server-side enforcement of the SEC-1 per-org "MFA required" policy
 * on org-scoped WRITE edge functions.
 *
 * Why here (not only in the DB): the write RPCs run as service_role, so inside
 * the RPC `request.jwt.claims` is the service key — the DB cannot see the end
 * user's assurance level. The edge fn is the only place that holds the caller's
 * JWT, so the aal1-vs-aal2 decision must be made here.
 *
 * Opt-in preserved: an org that never set mfa_required is never gated, and the
 * gate only applies to writes — aal1 reads (which never pass through here) are
 * unaffected.
 */
// Structural type — just the one method we call — so this module stays free of
// the esm.sh supabase import (which drags in @types/node and breaks `deno test`).
interface RpcClient {
  // supabase-js .rpc() returns a thenable builder, not a bare Promise — accept
  // any awaitable that resolves to the { data, error } shape.
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** Read the "aal" claim (aal1 | aal2) from an access-token JWT, locally. */
export function aalFromJwt(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json)?.aal ?? null;
  } catch {
    return null;
  }
}

/** aal value that satisfies an MFA-required org. */
export const AAL_MFA = "aal2";

/**
 * Returns true when the caller may perform an org-scoped write: either the org
 * does not require MFA, or the caller's session is MFA-verified (aal2). Uses the
 * service client to read the org's opt-in flag via org_requires_mfa().
 */
export async function mfaSatisfied(
  svc: RpcClient,
  jwt: string,
  orgId: string,
): Promise<boolean> {
  const { data: required, error } = await svc.rpc("org_requires_mfa", { p_org: orgId });
  if (error) throw error;
  if (!required) return true;
  return aalFromJwt(jwt) === AAL_MFA;
}
