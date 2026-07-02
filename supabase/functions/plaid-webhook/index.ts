/**
 * plaid-webhook — Plaid's event receiver (public; Plaid POSTs here, no user JWT).
 * On a TRANSACTIONS webhook (SYNC_UPDATES_AVAILABLE / INITIAL_UPDATE / …) it runs
 * the same /transactions/sync loop as plaid-sync.
 *
 * REPLAY-SAFE by construction: the ingestion RPC (plaid_ingest_transactions) is
 * idempotent on ext:plaid:<transaction_id>, so a duplicate webhook delivery — Plaid
 * retries, at-least-once — adds NOTHING. The webhook body carries only an item_id;
 * we resolve it to the org/connection and act as the connecting user.
 *
 * The item_id → connection lookup is the tenant boundary: an item we don't have a
 * connection for is ignored (200, so Plaid stops retrying an item that isn't ours).
 * (Roadmap §W2.3, red-team: webhook replay + item error states.)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runPlaidSync } from "../_shared/plaidSync.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const webhookType = String(body?.webhook_type ?? "");
  const webhookCode = String(body?.webhook_code ?? "");
  const itemId = String(body?.item_id ?? "");
  if (!itemId) return json({ received: true, ignored: "no_item_id" }, 200);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // resolve item → connection (tenant boundary). realm_id holds the Plaid item_id.
  const { data: conn } = await svc.from("external_connections")
    .select("id, org_id, access_token, sync_cursor, status, connected_by")
    .eq("provider", "plaid").eq("realm_id", itemId).maybeSingle();
  if (!conn) return json({ received: true, ignored: "unknown_item" }, 200);

  // ITEM errors (login required, permission revoked, …) → mark the connection, no sync.
  if (webhookType === "ITEM") {
    if (webhookCode === "ERROR" || webhookCode === "PENDING_EXPIRATION" || webhookCode === "USER_PERMISSION_REVOKED") {
      const err = body?.error?.error_message ?? webhookCode;
      await svc.from("external_connections").update({
        status: webhookCode === "USER_PERMISSION_REVOKED" ? "revoked" : "error",
        last_error: String(err), updated_at: new Date().toISOString(),
      }).eq("id", conn.id);
    }
    return json({ received: true, handled: "item", code: webhookCode }, 200);
  }

  // TRANSACTIONS updates → run the replay-safe sync loop.
  if (webhookType === "TRANSACTIONS") {
    if (conn.status !== "active") return json({ received: true, ignored: "inactive_connection" }, 200);
    try {
      const r = await runPlaidSync(
        svc, conn.connected_by as string, conn.org_id as string,
        conn as { id: string; access_token: string; sync_cursor: string | null },
      );
      return json({ received: true, code: webhookCode, ...r }, 200);
    } catch (e) {
      // 200 anyway — Plaid retries on non-2xx; the next SYNC webhook re-pulls from
      // the last good cursor. Record the error for visibility.
      await svc.from("external_connections").update({ last_error: (e as Error).message }).eq("id", conn.id);
      return json({ received: true, error: (e as Error).message }, 200);
    }
  }

  return json({ received: true, ignored: webhookType }, 200);
});
