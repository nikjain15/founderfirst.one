/**
 * xero-import — pull the chart of accounts + bank transactions from a connected
 * Xero org into a PREVIEWABLE import_batch (ARCHITECTURE.md §6.4, §6.6).
 * POST { org_id, connection_id }  (authed) → { batch_id, accounts, rows }
 *
 * Accounts are upserted into the ledger (idempotent). Transactions are STAGED,
 * not committed — the user reviews them in the Import tab and commits through the
 * same verified commit_import_batch path, so a mapping quirk can never corrupt the
 * books. NOTE: the transaction mapping (bank side + contra by line item) is a
 * best-effort first pass — validate against a real sandbox pull before GA.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { refreshToken, xeroGet, mapXeroAccountType, toMinor, xeroDate } from "../_shared/xero.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface XeroAccount { AccountID: string; Code?: string; Name: string; Class: string; Type?: string; }
interface XeroLineItem { AccountCode?: string; LineAmount?: number; Description?: string; }
interface XeroBankTxn {
  BankTransactionID: string; Type: string; Date?: string; Reference?: string;
  Total?: number; Contact?: { Name?: string };
  BankAccount?: { Code?: string }; LineItems?: XeroLineItem[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await svc.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.org_id ?? "");
  const connId = String(body?.connection_id ?? "");
  if (!orgId || !connId) return json({ error: "bad_request" }, 400);

  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

  const { data: conn } = await svc.from("external_connections")
    .select("id, org_id, realm_id, tenant_name, access_token, refresh_token, token_expires_at, status")
    .eq("id", connId).eq("org_id", orgId).eq("provider", "xero").maybeSingle();
  if (!conn || conn.status !== "active") return json({ error: "no_active_connection" }, 404);

  // refresh the token if it's expired (or about to)
  let access = conn.access_token as string;
  if (!conn.token_expires_at || new Date(conn.token_expires_at).getTime() < Date.now() + 60_000) {
    try {
      const t = await refreshToken(conn.refresh_token as string);
      access = t.access_token;
      await svc.from("external_connections").update({
        access_token: t.access_token, refresh_token: t.refresh_token,
        token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", conn.id);
    } catch (e) {
      await svc.from("external_connections").update({ status: "error", last_error: (e as Error).message }).eq("id", conn.id);
      return json({ error: "token_refresh_failed", detail: (e as Error).message }, 502);
    }
  }
  const tenant = conn.realm_id as string;

  try {
    // 1. chart of accounts → upsert; build code → ledger account id map
    const acctResp = await xeroGet("Accounts", access, tenant) as { Accounts?: XeroAccount[] };
    const codeToId = new Map<string, string>();
    let bankCode: string | null = null;
    let upserted = 0;
    for (const a of acctResp.Accounts ?? []) {
      const { data: acc } = await svc.rpc("upsert_ledger_account", {
        p_actor: user.id, p_org: orgId, p_name: a.Name,
        p_type: mapXeroAccountType(a.Class), p_code: a.Code ?? null,
      });
      const id = (acc as { id?: string })?.id;
      if (id && a.Code) codeToId.set(a.Code, id);
      if ((a.Type ?? "").toUpperCase() === "BANK" && a.Code && !bankCode) bankCode = a.Code;
      upserted++;
    }

    // 2. bank transactions → staged rows (previewable; not committed).
    //    Gracefully skip if the app lacks the accounting.transactions scope — the
    //    CoA import (above) still succeeds; transactions need that scope enabled.
    const rows: Record<string, unknown>[] = [];
    let rowNum = 0;
    let txnNote = "";
    try {
      for (let pageNum = 1; pageNum <= 20; pageNum++) {
        const txnResp = await xeroGet(`BankTransactions?page=${pageNum}`, access, tenant) as { BankTransactions?: XeroBankTxn[] };
        const txns = txnResp.BankTransactions ?? [];
        if (txns.length === 0) break;
        for (const t of txns) {
          const sign = (t.Type ?? "").toUpperCase().startsWith("RECEIVE") ? 1 : -1; // RECEIVE = into bank
          const contraCode = t.LineItems?.[0]?.AccountCode ?? null;
          const contraId = contraCode ? codeToId.get(contraCode) : undefined;
          rows.push({
            row_num: ++rowNum,
            raw: t as unknown as Record<string, unknown>,
            txn_date: xeroDate(t.Date),
            description: t.Contact?.Name ?? t.Reference ?? t.LineItems?.[0]?.Description ?? "Xero transaction",
            amount_minor: sign * toMinor(t.Total),
            account_id: contraId ?? null,
            status: contraId && t.Date && t.Total ? "ready" : "error",
          });
        }
        if (txns.length < 100) break;
      }
    } catch (e) {
      txnNote = ` Transactions skipped (${(e as Error).message.includes("403") ? "accounting.transactions scope not enabled on the Xero app" : (e as Error).message}).`;
    }

    const bankId = bankCode ? codeToId.get(bankCode) : undefined;
    const { data: batchRes, error: batchErr } = await svc.rpc("create_import_batch", {
      p_actor: user.id, p_org: orgId, p_source: "xero",
      p_filename: conn.tenant_name ?? "Xero", p_bank_account_id: bankId ?? null, p_cutover_date: null,
    });
    if (batchErr) return json({ error: batchErr.message }, 400);
    const batchId = (batchRes as { id: string }).id;

    if (rows.length > 0) {
      const { error: rowsErr } = await svc.rpc("add_import_rows", { p_actor: user.id, p_org: orgId, p_batch: batchId, p_rows: rows });
      if (rowsErr) return json({ error: rowsErr.message }, 400);
    }

    return json({
      batch_id: batchId, accounts: upserted, rows: rows.length,
      ready: rows.filter((r) => r.status === "ready").length,
      note: `Imported ${upserted} accounts.` +
        (rows.length ? ` ${rows.length} transactions staged — review and commit in the Import tab.` : txnNote),
    }, 200);
  } catch (e) {
    return json({ error: "import_failed", detail: (e as Error).message }, 502);
  }
});
