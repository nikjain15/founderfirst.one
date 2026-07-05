/**
 * qbo-import — pull the chart of accounts + transactions from a connected
 * QuickBooks company (ARCHITECTURE.md §6.4, §6.6). Two modes:
 *
 *   • default (preview) — POST { org_id, connection_id } → one PREVIEWABLE batch
 *     of the primary bank's Purchases/Deposits, not committed. (Unchanged.)
 *   • historical migration — POST { org_id, connection_id, historical: true } →
 *     W2.2 one-click migration: pull the FULL Purchase + Deposit history across
 *     all pages, bucket into ONE import_batch per calendar year, stage each row
 *     with its QBO transaction id as external_id (so a re-pull dedups on
 *     ext:qbo:<id> and NEVER double-posts), snapshot QBO's own Trial Balance for
 *     the side-by-side comparison, and record a provider_migration the UI drives
 *     through mapping review → TB compare → cutover.
 *
 * Nothing is posted here — the app commits each batch through the verified,
 * deduped commit_import_batch(4-arg) path (source 'qbo' → bank branch).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { refreshToken, qboQuery, qboQueryAll, qboTrialBalance, mapQboAccountType, toMinor } from "../_shared/qbo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface QboAccount { Id: string; Name: string; AcctNum?: string; Classification: string; AccountType?: string; }
interface QboRef { value: string; name?: string; }
interface QboTxn { Id: string; TxnDate?: string; TotalAmt?: number; PrivateNote?: string; EntityRef?: QboRef; AccountRef?: QboRef; DepositToAccountRef?: QboRef; Line?: { AccountBasedExpenseLineDetail?: { AccountRef?: QboRef }; DepositLineDetail?: { AccountRef?: QboRef } }[]; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await svc.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const uid = user.id; // stable non-null ref for closures below

  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.org_id ?? "");
  const connId = String(body?.connection_id ?? "");
  if (!orgId || !connId) return json({ error: "bad_request" }, 400);

  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

  const { data: conn } = await svc.from("external_connections")
    .select("id, realm_id, tenant_name, access_token, refresh_token, token_expires_at, status")
    .eq("id", connId).eq("org_id", orgId).eq("provider", "qbo").maybeSingle();
  if (!conn || conn.status !== "active") return json({ error: "no_active_connection" }, 404);

  // CONN-2: last intuit_tid seen this request (success or error) — persisted to
  // external_connections so it can be produced for Intuit support troubleshooting.
  let lastTid: string | null = null;
  const noteTid = (tid: string | null) => { if (tid) lastTid = tid; };
  const persistTid = () => svc.from("external_connections").update({ last_intuit_tid: lastTid }).eq("id", conn.id);

  let access = conn.access_token as string;
  if (!conn.token_expires_at || new Date(conn.token_expires_at).getTime() < Date.now() + 60_000) {
    try {
      const t = await refreshToken(conn.refresh_token as string, noteTid);
      access = t.access_token;
      await svc.from("external_connections").update({
        access_token: t.access_token, refresh_token: t.refresh_token,
        token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
        last_intuit_tid: lastTid, updated_at: new Date().toISOString(),
      }).eq("id", conn.id);
    } catch (e) {
      await svc.from("external_connections").update({ status: "error", last_error: (e as Error).message, last_intuit_tid: lastTid }).eq("id", conn.id);
      return json({ error: "token_refresh_failed", detail: (e as Error).message }, 502);
    }
  }
  const realm = conn.realm_id as string;
  const historical = body?.historical === true;

  // ── shared: pull + upsert the chart of accounts, return QBO id → ledger id ──
  async function pullChartOfAccounts(): Promise<{ map: Map<string, string>; count: number }> {
    const acctResp = await qboQuery(realm, "select * from Account maxresults 1000", access, noteTid);
    const accounts: QboAccount[] = acctResp?.QueryResponse?.Account ?? [];
    const map = new Map<string, string>();
    for (const a of accounts) {
      const { data: acc } = await svc.rpc("upsert_ledger_account", {
        p_actor: uid, p_org: orgId, p_name: a.Name,
        p_type: mapQboAccountType(a.Classification), p_code: a.AcctNum ?? null,
      });
      const id = (acc as { id?: string })?.id;
      if (id) map.set(a.Id, id);
    }
    return { map, count: accounts.length };
  }

  const yearOf = (d?: string | null) => (d && d.length >= 4 ? d.slice(0, 4) : "unknown");

  // ── W2.2 historical migration ───────────────────────────────────────────────
  if (historical) {
    try {
      const { map: qboIdToOurId, count: acctCount } = await pullChartOfAccounts();

      // Full history (all pages), not just the first 500.
      const purchases: QboTxn[] = await qboQueryAll(realm, "Purchase", access, { onTid: noteTid });
      const deposits: QboTxn[] = await qboQueryAll(realm, "Deposit", access, { onTid: noteTid });

      // Primary bank = the account most transactions clear through.
      const bankCount = new Map<string, number>();
      for (const p of purchases) { const b = p.AccountRef?.value; if (b) bankCount.set(b, (bankCount.get(b) ?? 0) + 1); }
      for (const d of deposits) { const b = d.DepositToAccountRef?.value; if (b) bankCount.set(b, (bankCount.get(b) ?? 0) + 1); }
      const primaryBankQboId = [...bankCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const bankId = primaryBankQboId ? qboIdToOurId.get(primaryBankQboId) : undefined;

      // Normalize every txn on the primary bank into a staged row keyed by its QBO id.
      interface Staged { row_num: number; raw: unknown; txn_date: string | null; description: string; amount_minor: number; account_id: string | null; external_id: string; status: string; }
      const byYear = new Map<string, Staged[]>();
      let txnCount = 0;
      const stage = (t: QboTxn, sign: 1 | -1, bankQboId: string | undefined, contraQboId: string | undefined, desc: string, kind: string) => {
        if (bankQboId !== primaryBankQboId) return; // off-primary-bank txns are out of scope for this pass
        const contraId = contraQboId ? qboIdToOurId.get(contraQboId) ?? null : null;
        const year = yearOf(t.TxnDate);
        const list = byYear.get(year) ?? [];
        list.push({
          row_num: list.length + 1, raw: t as unknown,
          txn_date: t.TxnDate ?? null, description: desc,
          amount_minor: sign * toMinor(t.TotalAmt), account_id: contraId,
          external_id: `${kind}:${t.Id}`,           // stable per-txn id → ext:qbo:<external_id>
          status: t.TxnDate ? "ready" : "error",
        });
        byYear.set(year, list);
        txnCount++;
      };
      for (const p of purchases)
        stage(p, -1, p.AccountRef?.value, p.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.value, p.EntityRef?.name ?? p.PrivateNote ?? "Purchase", "purchase");
      for (const d of deposits)
        stage(d, 1, d.DepositToAccountRef?.value, d.Line?.[0]?.DepositLineDetail?.AccountRef?.value, d.PrivateNote ?? "Deposit", "deposit");

      // One import_batch per year, staged via append_import_rows (writes external_id).
      const years = [...byYear.keys()].sort();
      const batchIds: string[] = [];
      for (const year of years) {
        const { data: batchRes, error: batchErr } = await svc.rpc("create_import_batch", {
          p_actor: uid, p_org: orgId, p_source: "qbo",
          p_filename: `${conn.tenant_name ?? "QuickBooks"} · ${year}`,
          p_bank_account_id: bankId ?? null, p_cutover_date: null,
        });
        if (batchErr) return json({ error: batchErr.message }, 400);
        const batchId = (batchRes as { id: string }).id;
        batchIds.push(batchId);
        const rows = byYear.get(year)!;
        const { error: rowsErr } = await svc.rpc("append_import_rows", { p_actor: uid, p_org: orgId, p_batch: batchId, p_rows: rows });
        if (rowsErr) return json({ error: rowsErr.message }, 400);
      }

      // Snapshot QBO's own Trial Balance for the side-by-side comparison.
      let providerTb: { name: string; debit_minor: number; credit_minor: number }[] = [];
      let providerTbAsOf: string | null = null;
      try {
        const tb = await qboTrialBalance(realm, access, undefined, noteTid);
        providerTb = tb.rows;
        providerTbAsOf = tb.asOf;
      } catch (_e) { /* TB report is best-effort; migration still proceeds without it */ }

      const { data: mig, error: migErr } = await svc.rpc("record_provider_migration", {
        p_actor: uid, p_org: orgId, p_connection: connId, p_provider: "qbo",
        p_batch_ids: batchIds, p_accounts: acctCount, p_txn_count: txnCount,
        p_provider_tb: providerTb, p_provider_tb_as_of: providerTbAsOf,
      });
      if (migErr) return json({ error: migErr.message }, 400);

      await persistTid();
      return json({
        migration_id: (mig as { id: string })?.id, batch_ids: batchIds,
        accounts: acctCount, txn_count: txnCount, years,
        provider_tb_rows: providerTb.length, provider_tb_as_of: providerTbAsOf,
      }, 200);
    } catch (e) {
      await persistTid();
      return json({ error: "migration_failed", detail: (e as Error).message }, 502);
    }
  }

  try {
    // 1. chart of accounts → upsert; map QBO account Id → our ledger id
    const acctResp = await qboQuery(realm, "select * from Account maxresults 1000", access, noteTid);
    const accounts: QboAccount[] = acctResp?.QueryResponse?.Account ?? [];
    const qboIdToOurId = new Map<string, string>();
    const bankCount = new Map<string, number>();
    let upserted = 0;
    for (const a of accounts) {
      const { data: acc } = await svc.rpc("upsert_ledger_account", {
        p_actor: user.id, p_org: orgId, p_name: a.Name,
        p_type: mapQboAccountType(a.Classification), p_code: a.AcctNum ?? null,
      });
      const id = (acc as { id?: string })?.id;
      if (id) qboIdToOurId.set(a.Id, id);
      upserted++;
    }

    // 2. transactions: Purchases (out) + Deposits (in)
    const purchases: QboTxn[] = (await qboQuery(realm, "select * from Purchase maxresults 500", access, noteTid))?.QueryResponse?.Purchase ?? [];
    const deposits: QboTxn[] = (await qboQuery(realm, "select * from Deposit maxresults 500", access, noteTid))?.QueryResponse?.Deposit ?? [];
    for (const p of purchases) { const b = p.AccountRef?.value; if (b) bankCount.set(b, (bankCount.get(b) ?? 0) + 1); }
    for (const d of deposits) { const b = d.DepositToAccountRef?.value; if (b) bankCount.set(b, (bankCount.get(b) ?? 0) + 1); }
    const primaryBankQboId = [...bankCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const bankId = primaryBankQboId ? qboIdToOurId.get(primaryBankQboId) : undefined;

    const rows: Record<string, unknown>[] = [];
    let n = 0;
    const stage = (t: QboTxn, sign: 1 | -1, bankQboId: string | undefined, contraQboId: string | undefined, desc: string) => {
      const onPrimary = bankQboId === primaryBankQboId;
      const contraId = contraQboId ? qboIdToOurId.get(contraQboId) : undefined;
      rows.push({
        row_num: ++n, raw: t as unknown as Record<string, unknown>,
        txn_date: t.TxnDate ?? null, description: desc,
        amount_minor: sign * toMinor(t.TotalAmt), account_id: contraId ?? null,
        status: onPrimary && contraId && t.TxnDate ? "ready" : "skipped",
      });
    };
    for (const p of purchases)
      stage(p, -1, p.AccountRef?.value, p.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.value, p.EntityRef?.name ?? p.PrivateNote ?? "Purchase");
    for (const d of deposits)
      stage(d, 1, d.DepositToAccountRef?.value, d.Line?.[0]?.DepositLineDetail?.AccountRef?.value, d.PrivateNote ?? "Deposit");

    const { data: batchRes, error: batchErr } = await svc.rpc("create_import_batch", {
      p_actor: user.id, p_org: orgId, p_source: "qbo",
      p_filename: conn.tenant_name ?? "QuickBooks", p_bank_account_id: bankId ?? null, p_cutover_date: null,
    });
    if (batchErr) return json({ error: batchErr.message }, 400);
    const batchId = (batchRes as { id: string }).id;
    if (rows.length > 0) {
      const { error: rowsErr } = await svc.rpc("add_import_rows", { p_actor: user.id, p_org: orgId, p_batch: batchId, p_rows: rows });
      if (rowsErr) return json({ error: rowsErr.message }, 400);
    }

    await persistTid();
    return json({
      batch_id: batchId, accounts: upserted, rows: rows.length,
      ready: rows.filter((r) => r.status === "ready").length,
      note: "Accounts imported. Transactions on the primary bank account are staged for preview; review and commit in the Import tab.",
    }, 200);
  } catch (e) {
    await persistTid();
    return json({ error: "import_failed", detail: (e as Error).message }, 502);
  }
});
