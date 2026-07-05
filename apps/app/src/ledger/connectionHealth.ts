/**
 * Connection-health helpers (IQ-2) — pure logic behind the Connections UX.
 *
 * A connection whose OAuth/token has failed (e.g. QuickBooks `invalid_grant`
 * after a password change or 90-day expiry) lands in `status='error'`. Left
 * unshown, the owner keeps looking at stale books with no path to fix it. These
 * helpers pick out the broken connections and decide which ones can be repaired
 * with a one-click Reconnect, so the UI can honestly say "this needs you" and
 * offer the fix — never strand the user on stale data.
 *
 * Kept pure (no React, no network) so it is unit-testable in the node vitest env.
 */
import type { ExternalConnection } from "./api";

/** A connection is broken when the provider rejected our token / access. */
export function isBroken(c: Pick<ExternalConnection, "status">): boolean {
  return c.status === "error" || c.status === "revoked";
}

/** Every broken connection, whichever provider. */
export function brokenConnections(
  conns: ExternalConnection[] | undefined,
): ExternalConnection[] {
  return (conns ?? []).filter(isBroken);
}

/** OAuth-redirect providers can be repaired by re-running their connect flow. */
export function isReconnectable(
  c: Pick<ExternalConnection, "provider">,
): c is Pick<ExternalConnection, "provider"> & { provider: "qbo" | "xero" } {
  return c.provider === "qbo" || c.provider === "xero";
}
