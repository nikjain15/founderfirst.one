// One-off backfill: infer contact_name / contact_company for EXISTING leads
// using the same score() extraction the live worker now runs on new leads.
//
// Safe to re-run. It only fills a field that is currently null — it never
// overwrites a value a human has saved in the drawer. Reads post text from
// sig_items, writes contact fields directly via the service-role client
// (bypasses RLS, same as the worker).
//
//   node --env-file=.env backfill-contacts.mjs           # apply
//   node --env-file=.env backfill-contacts.mjs --dry-run # preview only

import { createClient } from "@supabase/supabase-js";
import { score } from "./brain.mjs";

const DRY = process.argv.includes("--dry-run");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { data: leads, error } = await db
  .from("sig_leads")
  .select("id, contact_name, contact_company, sig_items(title, body, author_handle)")
  .or("contact_name.is.null,contact_company.is.null");
if (error) { console.error("fetch leads failed:", error.message); process.exit(1); }

console.log(`${DRY ? "[dry-run] " : ""}${leads.length} lead(s) missing contact info`);
let filled = 0, skipped = 0, failed = 0;

for (const lead of leads) {
  const item = lead.sig_items;
  if (!item) { skipped++; continue; }
  let r;
  try {
    r = await score({ title: item.title, body: item.body });
  } catch (e) {
    failed++; console.warn(`  score failed for ${lead.id}: ${e.message}`); continue;
  }
  // Only fill fields that are currently null — never clobber a human edit.
  const patch = {};
  if (lead.contact_name == null && r.contact_name) patch.contact_name = r.contact_name;
  if (lead.contact_company == null && r.contact_company) patch.contact_company = r.contact_company;
  if (Object.keys(patch).length === 0) { skipped++; continue; }

  if (DRY) {
    console.log(`  would fill ${lead.id}: ${JSON.stringify(patch)}`);
    filled++; continue;
  }
  const { error: upErr } = await db.from("sig_leads").update(patch).eq("id", lead.id);
  if (upErr) { failed++; console.warn(`  update failed for ${lead.id}: ${upErr.message}`); continue; }
  console.log(`  filled ${lead.id}: ${JSON.stringify(patch)}`);
  filled++;
}

console.log(`\nDone. filled=${filled} skipped=${skipped} failed=${failed}`);
process.exit(0);
