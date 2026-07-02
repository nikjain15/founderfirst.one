/**
 * plaidSync — the shared /transactions/sync loop used by plaid-exchange (initial
 * pull), plaid-sync (manual/scheduled), and plaid-webhook (event-driven).
 *
 * Idempotency + reversal-based corrections live in the DB RPC
 * (plaid_ingest_transactions); this loop just pages Plaid with the stored cursor
 * and hands each page to the RPC. Because the RPC is replay-safe, running this
 * twice (a duplicate webhook) is a no-op. The cursor is advanced ONLY after a page
 * ingests cleanly, so a mid-loop failure re-pulls from the last good cursor
 * (Plaid guarantees a stable cursor position).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { transactionsSync, normalizeTxn } from "./plaid.ts";

interface Conn { id: string; access_token: string; sync_cursor: string | null; }

export interface SyncResult { added: number; modified: number; removed: number; skipped: number; pages: number; }

export async function runPlaidSync(
  svc: SupabaseClient, actorId: string, orgId: string, conn: Conn,
): Promise<SyncResult> {
  let cursor = conn.sync_cursor;
  const total: SyncResult = { added: 0, modified: 0, removed: 0, skipped: 0, pages: 0 };
  let hasMore = true;
  let guard = 0;

  while (hasMore && guard < 100) {
    guard++;
    const page = await transactionsSync(conn.access_token, cursor);
    const added = page.added.map(normalizeTxn);
    const modified = page.modified.map(normalizeTxn);
    const removed = page.removed.map((r) => ({ transaction_id: r.transaction_id }));

    const { data, error } = await svc.rpc("plaid_ingest_transactions", {
      p_actor: actorId, p_org: orgId, p_conn: conn.id,
      p_added: added, p_modified: modified, p_removed: removed,
    });
    if (error) throw new Error(error.message);
    const r = (data ?? {}) as { added?: number; modified?: number; removed?: number; skipped?: number };
    total.added += r.added ?? 0;
    total.modified += r.modified ?? 0;
    total.removed += r.removed ?? 0;
    total.skipped += r.skipped ?? 0;
    total.pages++;

    // advance the cursor only after a clean ingest of this page
    cursor = page.next_cursor;
    const { error: curErr } = await svc.rpc("plaid_set_cursor", {
      p_actor: actorId, p_org: orgId, p_conn: conn.id, p_cursor: cursor,
    });
    if (curErr) throw new Error(curErr.message);
    hasMore = page.has_more;
  }
  return total;
}
