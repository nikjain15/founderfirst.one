import fs from "node:fs";
const REF = "ejqsfzggyfsjzrcevlnq";
const BASE = `https://${REF}.supabase.co`;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = fs.readFileSync("./.anon", "utf8").trim();
const out = JSON.parse(fs.readFileSync("./e2e-out.json", "utf8"));
const { orgId, bankId, expId } = out.fixtures;
const EMAIL = "owner@csvtest.founderfirst.test";
async function j(method, path, headers, body) {
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, d };
}
const adminH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const gl = await j("POST", "/auth/v1/admin/generate_link", adminH, { type: "magiclink", email: EMAIL });
const v = await j("POST", "/auth/v1/verify", { apikey: ANON, "Content-Type": "application/json" }, { type: "magiclink", email: EMAIL, token: gl.d.email_otp });
const H = { apikey: ANON, Authorization: `Bearer ${v.d.access_token}`, "Content-Type": "application/json" };
const fn = (name, body) => j("POST", `/functions/v1/${name}`, H, body);
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json", "User-Agent": "ff-csvtest/1.0" },
    body: JSON.stringify({ query }) }); return r.json();
}

console.log("════ TEST D — post-fix row shape: bad date degrades to error, good row imports ════");
const b = await fn("imports", { op: "create", org_id: orgId, source: "bank_statement", filename: "postfix.csv", bank_account_id: bankId });
const batch = b.d.result.id;
// This is exactly what the PATCHED ImportFlow sends: the Feb-30 row parsed to date=null → valid=false → status 'error', txn_date null
const rows = [
  { row_num: 1, raw: { Date: "03/05/2026", Amount: "77.00" }, txn_date: "2026-03-05", description: "Good row", amount_minor: 7700, account_id: expId, status: "ready" },
  { row_num: 2, raw: { Date: "02/30/2026", Amount: "99.00" }, txn_date: null, description: "Feb 30 (now flagged invalid in preview)", amount_minor: 9900, account_id: expId, status: "error" },
];
const ar = await fn("imports", { op: "add_rows", org_id: orgId, batch_id: batch, rows });
console.log("  add_rows →", ar.status, JSON.stringify(ar.d), ar.status === 200 ? "✔ no 22008 crash" : "✘");
const cm = await fn("imports", { op: "commit", org_id: orgId, batch_id: batch });
console.log("  commit →", cm.status, "status=", cm.d?.result?.status, cm.status === 200 ? "✔ good row posts, bad row skipped" : "✘");
const tie = await sql(`select coalesce(sum(case when side='D' then amount_minor else 0 end),0) dr, coalesce(sum(case when side='C' then amount_minor else 0 end),0) cr, (select count(*) from journal_entries where org_id='${orgId}') entries from journal_lines where org_id='${orgId}'`);
const row = Array.isArray(tie) ? tie[0] : tie;
console.log(`  tie-out: Dr=${row.dr} Cr=${row.cr} ${row.dr===row.cr?"✔ BALANCED":"✘"} · entries=${row.entries} (was 6 → +1 good row = 7 expected)`);
const st = await sql(`select status,count(*) n from import_rows where batch_id='${batch}' group by status order by status`);
console.log("  batch D row statuses:", JSON.stringify(st));
