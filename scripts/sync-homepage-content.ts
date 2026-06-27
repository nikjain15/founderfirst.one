/**
 * Publish the homepage `home.ts` seed → the live `content_pages` DB row.
 *
 * The Astro homepage renders the PUBLISHED content_pages row at build time and
 * falls back to the seed only when none exists. After a redesign the seed and
 * the live row drift — this script republishes the seed as the new live version.
 *
 * SAFE BY DEFAULT (LEARNINGS rule 4): dry-run unless APPLY=1.
 *   - Backs up the current live row to scripts/.backups/ before any write.
 *   - Demotes the old live row, inserts the new one as live (version auto-bumps).
 *
 * Usage (you hold the key — it never goes through chat):
 *   SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/sync-homepage-content.ts        # dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=… APPLY=1 npx tsx scripts/sync-homepage-content.ts # write
 *
 * Then rebuild so the static homepage picks it up:
 *   gh workflow run pages.yml
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homeSeed } from "../apps/web/src/seed/home";

const URL = process.env.SUPABASE_URL ?? "https://ejqsfzggyfsjzrcevlnq.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "1";

if (!KEY) {
  console.error("✗ Set SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API → service_role).");
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const { data: live, error: readErr } = await db
    .from("content_pages").select("*").eq("slug", "/").eq("is_live", true);
  if (readErr) throw new Error(`read live row: ${readErr.message}`);

  const current = live?.[0];
  console.info(`Current live homepage: ${current ? `version ${current.version}` : "none"}`);
  console.info(`New payload: ${homeSeed.sections.length} sections — types: ${homeSeed.sections.map((s) => s.type).join(", ")}`);

  if (current) {
    const dir = resolve(here, ".backups");
    mkdirSync(dir, { recursive: true });
    const f = resolve(dir, `content_pages_home_v${current.version}.json`);
    writeFileSync(f, JSON.stringify(current, null, 2));
    console.info(`✓ Backed up current live row → ${f}`);
  }

  if (!APPLY) {
    console.info("\nDRY-RUN — no changes written. Re-run with APPLY=1 to publish.");
    return;
  }

  if (current) {
    const { error } = await db.from("content_pages").update({ is_live: false }).eq("id", current.id);
    if (error) throw new Error(`demote old live: ${error.message}`);
  }
  const { error: insErr } = await db.from("content_pages").insert({
    slug: "/", surface: "marketing", payload: homeSeed, is_live: true,
    notes: "Republish from home.ts seed — staging-aligned redesign",
  });
  if (insErr) throw new Error(`insert new live: ${insErr.message}`);

  console.info("✓ Published new live homepage version. Now run: gh workflow run pages.yml");
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
