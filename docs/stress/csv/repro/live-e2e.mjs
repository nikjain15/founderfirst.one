import fs from "node:fs";
const REF = "ejqsfzggyfsjzrcevlnq";
const BASE = `https://${REF}.supabase.co`;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = fs.readFileSync("./.anon", "utf8").trim();
const TAG = "CSVTEST";
const EMAIL = `owner@${TAG.toLowerCase()}.founderfirst.test`;
const log = (...a) => console.log(...a);

async function j(method, path, headers, body) {
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, d };
}
const adminH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

// ── mint a user session ───────────────────────────────────────────────
async function mint() {
  // create (idempotent: ignore "already registered")
  await j("POST", "/auth/v1/admin/users", adminH, { email: EMAIL, email_confirm: true });
  const gl = await j("POST", "/auth/v1/admin/generate_link", adminH, { type: "magiclink", email: EMAIL });
  const otp = gl.d?.email_otp ?? gl.d?.properties?.email_otp;
  if (!otp) throw new Error("no otp: " + JSON.stringify(gl.d));
  const v = await j("POST", "/auth/v1/verify", { apikey: ANON, "Content-Type": "application/json" },
    { type: "magiclink", email: EMAIL, token: otp });
  const tok = v.d?.access_token;
  if (!tok) throw new Error("no jwt: " + JSON.stringify(v.d));
  return tok;
}
function userH(tok) { return { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }; }
const fn = (h, name, body) => j("POST", `/functions/v1/${name}`, h, body);

// ── ledger tie-out for an org via Management API SQL ───────────────────
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json", "User-Agent": "ff-csvtest/1.0" },
    body: JSON.stringify({ query }),
  });
  return r.json();
}
async function tieOut(orgId, label) {
  const q = `select coalesce(sum(case when side='D' then amount_minor else 0 end),0) dr,
                    coalesce(sum(case when side='C' then amount_minor else 0 end),0) cr,
                    (select count(*) from journal_entries where org_id='${orgId}') entries
             from journal_lines where org_id='${orgId}'`;
  const r = await sql(q); const row = Array.isArray(r) ? r[0] : r;
  const ties = row.dr === row.cr;
  log(`   tie-out [${label}]: Dr=${row.dr} Cr=${row.cr} ${ties ? "✔ BALANCED" : "✘ IMBALANCE"} · entries=${row.entries}`);
  return { ...row, ties };
}

(async () => {
  const out = { fixtures: {} };
  const tok = await mint();
  log("✓ minted session for", EMAIL);

  const org = await fn(userH(tok), "orgs", { type: "business", name: `[${TAG}] Stress Co` });
  if (org.status !== 201) throw new Error("org create failed: " + JSON.stringify(org.d));
  const orgId = org.d.org.id; out.fixtures.orgId = orgId;
  log("✓ org", orgId);

  // two accounts: a bank (asset) + an expense contra
  const bank = await fn(userH(tok), "ledger-accounts", { org_id: orgId, name: `[${TAG}] Checking`, type: "asset", code: "1000" });
  const exp = await fn(userH(tok), "ledger-accounts", { org_id: orgId, name: `[${TAG}] Office Expense`, type: "expense", code: "6000" });
  const bankId = bank.d.account.id, expId = exp.d.account.id;
  out.fixtures.bankId = bankId; out.fixtures.expId = expId;
  log("✓ accounts bank=", bankId, "exp=", expId);

  const H = userH(tok);
  const rawOf = (date, desc, amt) => ({ Date: date, Description: desc, Amount: amt });

  // ════ TEST A — good path: 3 valid rows commit & tie ════
  log("\n════ TEST A — good path (3 valid rows) ════");
  let b = await fn(H, "imports", { op: "create", org_id: orgId, source: "bank_statement", filename: "good.csv", bank_account_id: bankId });
  const batchA = b.d.result.id; out.fixtures.batchA = batchA;
  const goodRows = [
    { row_num: 1, raw: rawOf("01/15/2026","Client deposit","1000.00"), txn_date: "2026-01-15", description: "Client deposit", amount_minor: 100000, account_id: expId, status: "ready" },
    { row_num: 2, raw: rawOf("01/16/2026","Coffee","-12.50"), txn_date: "2026-01-16", description: "Coffee", amount_minor: -1250, account_id: expId, status: "ready" },
    { row_num: 3, raw: rawOf("01/17/2026","Stripe payout","2345.67"), txn_date: "2026-01-17", description: "Stripe payout", amount_minor: 234567, account_id: expId, status: "ready" },
  ];
  let ar = await fn(H, "imports", { op: "add_rows", org_id: orgId, batch_id: batchA, rows: goodRows });
  log("  add_rows →", ar.status, JSON.stringify(ar.d));
  let cm = await fn(H, "imports", { op: "commit", org_id: orgId, batch_id: batchA });
  log("  commit →", cm.status, "status=", cm.d?.result?.status);
  const tieA = await tieOut(orgId, "after A"); out.tieA = tieA;

  // ════ TEST B — bad calendar date aborts the WHOLE batch ════
  log("\n════ TEST B — impossible date 02/30/2026 among good rows ════");
  b = await fn(H, "imports", { op: "create", org_id: orgId, source: "bank_statement", filename: "baddate.csv", bank_account_id: bankId });
  const batchB = b.d.result.id; out.fixtures.batchB = batchB;
  const mixed = [
    { row_num: 1, raw: rawOf("02/01/2026","Good row","50.00"), txn_date: "2026-02-01", description: "Good row", amount_minor: 5000, account_id: expId, status: "ready" },
    { row_num: 2, raw: rawOf("02/30/2026","Impossible Feb-30 (preview showed ✓)","99.00"), txn_date: "2026-02-30", description: "Feb 30", amount_minor: 9900, account_id: expId, status: "ready" },
  ];
  ar = await fn(H, "imports", { op: "add_rows", org_id: orgId, batch_id: batchB, rows: mixed });
  log("  add_rows →", ar.status, "body=", JSON.stringify(ar.d));
  // how many rows actually staged?
  const stagedB = await sql(`select count(*) n from import_rows where batch_id='${batchB}'`);
  log("  rows staged in batch B:", JSON.stringify(Array.isArray(stagedB)?stagedB[0]:stagedB), "(0 = whole add_rows aborted)");
  const tieB = await tieOut(orgId, "after B attempt"); out.tieB = tieB;
  log("  → entries unchanged from A?", tieB.entries === tieA.entries ? "✔ nothing half-posted (atomic)" : "✘ LEAK");

  // ════ TEST C — re-import SAME good file = double post (dedup gap) ════
  log("\n════ TEST C — re-import identical good file (dedup?) ════");
  b = await fn(H, "imports", { op: "create", org_id: orgId, source: "bank_statement", filename: "good.csv", bank_account_id: bankId });
  const batchC = b.d.result.id; out.fixtures.batchC = batchC;
  await fn(H, "imports", { op: "add_rows", org_id: orgId, batch_id: batchC, rows: goodRows });
  cm = await fn(H, "imports", { op: "commit", org_id: orgId, batch_id: batchC });
  log("  commit →", cm.status, "status=", cm.d?.result?.status);
  const tieC = await tieOut(orgId, "after C"); out.tieC = tieC;
  log("  → entries after re-import:", tieC.entries, "(", tieA.entries, "→", tieC.entries, ") double-post?", tieC.entries === tieA.entries*2 ? "✘ YES, no cross-batch dedup" : "—");

  fs.writeFileSync("./e2e-out.json", JSON.stringify(out, null, 2));
  log("\n✓ fixtures:", JSON.stringify(out.fixtures));
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
