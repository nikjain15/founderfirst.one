/**
 * qbo-import — pull the chart of accounts + transactions from a connected
 * QuickBooks company into a PREVIEWABLE import_batch (ARCHITECTURE.md §6.4, §6.6).
 * POST { org_id, connection_id } (authed) → { batch_id, accounts, rows }.
 *
 * Accounts upsert into the ledger. Purchases (money out) + Deposits (money in)
 * stage as rows against the primary bank account — previewed, not committed.
 * NOTE: QBO's transaction model spans Purchase/Deposit/JournalEntry across
 * multiple bank accounts; this first pass stages txns on the primary bank and
 * skips the rest. Validate against a sandbox company before GA.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { refreshToken, qboQuery, mapQboAccountType, toMinor, minorFactor } from "../_shared/qbo.ts";

const PURCHASE_CAP = 500, DEPOSIT_CAP = 500; // QBO maxresults per query (see toward GA: paginate)

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
  const realm = conn.realm_id as string;

  // Scale amounts by the org's home-currency exponent (JPY/KRW=×1, most=×100).
  const { data: oas } = await svc.from("org_accounting_settings").select("home_currency").eq("org_id", orgId).maybeSingle();
  const factor = minorFactor((oas as { home_currency?: string } | null)?.home_currency ?? "USD");

  // Dedup: provider txns already imported (committed) for this org must not re-post
  // on a second pull. The DB also enforces this via a stable idempotency key, but we
  // pre-mark known txns 'skipped' so the preview is honest. Tolerate a pre-migration
  // schema (external_id absent) by degrading to no pre-skip — the DB key still guards.
  const seen = new Set<string>();
  try {
    const { data: prior } = await svc.from("import_rows")
      .select("external_id, import_batches!inner(org_id, source, status)")
      .eq("import_batches.org_id", orgId).eq("import_batches.source", "qbo")
      .eq("import_batches.status", "committed").not("external_id", "is", null);
    for (const r of (prior ?? []) as { external_id: string }[]) if (r.external_id) seen.add(r.external_id);
  } catch { /* external_id column not yet deployed — DB idempotency key still protects */ }

  try {
    // 1. chart of accounts → upsert; map QBO account Id → our ledger id
    const acctResp = await qboQuery(realm, "select * from Account maxresults 1000", access);
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
    const purchases: QboTxn[] = (await qboQuery(realm, `select * from Purchase maxresults ${PURCHASE_CAP}`, access))?.QueryResponse?.Purchase ?? [];
    const deposits: QboTxn[] = (await qboQuery(realm, `select * from Deposit maxresults ${DEPOSIT_CAP}`, access))?.QueryResponse?.Deposit ?? [];
    const truncated = purchases.length >= PURCHASE_CAP || deposits.length >= DEPOSIT_CAP;
    for (const p of purchases) { const b = p.AccountRef?.value; if (b) bankCount.set(b, (bankCount.get(b) ?? 0) + 1); }
    for (const d of deposits) { const b = d.DepositToAccountRef?.value; if (b) bankCount.set(b, (bankCount.get(b) ?? 0) + 1); }
    const primaryBankQboId = [...bankCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const bankId = primaryBankQboId ? qboIdToOurId.get(primaryBankQboId) : undefined;

    const rows: Record<string, unknown>[] = [];
    let n = 0, skippedDup = 0;
    const stage = (t: QboTxn, sign: 1 | -1, bankQboId: string | undefined, contraQboId: string | undefined, desc: string) => {
      const onPrimary = bankQboId === primaryBankQboId;
      const contraId = contraQboId ? qboIdToOurId.get(contraQboId) : undefined;
      const externalId = `${t.Id ?? ""}`;
      const isDup = externalId !== "" && seen.has(externalId);
      if (isDup) skippedDup++;
      rows.push({
        row_num: ++n, raw: t as unknown as Record<string, unknown>, external_id: externalId || null,
        txn_date: t.TxnDate ?? null, description: desc,
        amount_minor: sign * toMinor(t.TotalAmt, factor), account_id: contraId ?? null,
        // already-imported provider txns are skipped (not re-posted); the DB stable
        // idempotency key is the authoritative guard if two batches are committed.
        status: isDup ? "skipped" : (onPrimary && contraId && t.TxnDate ? "ready" : "skipped"),
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

    return json({
      batch_id: batchId, accounts: upserted, rows: rows.length,
      ready: rows.filter((r) => r.status === "ready").length,
      skipped_duplicates: skippedDup,
      truncated,
      note: "Accounts imported. Transactions on the primary bank account are staged for preview; review and commit in the Import tab."
        + (skippedDup > 0 ? ` ${skippedDup} already-imported transaction(s) were skipped.` : "")
        + (truncated ? " Note: this pull hit the per-query cap, so older transactions may not be included yet." : ""),
    }, 200);
  } catch (e) {
    return json({ error: "import_failed", detail: (e as Error).message }, 502);
  }
});
