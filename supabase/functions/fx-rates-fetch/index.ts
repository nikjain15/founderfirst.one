/**
 * fx-rates-fetch — W5.4-FX: populates `fx_rates` from the ECB daily reference
 * feed (EUR-base, public, keyless). Without this, W5.4's resolver correctly
 * fails loud on any foreign-currency post (D3: "never silently default to
 * 1") but there is nothing for it to resolve against — this function is what
 * makes multi-currency actually usable end to end.
 *
 * Two modes (POST body { "mode": "daily" | "backfill" }, default "daily"):
 *   • "daily"    — pulls today's single-day snapshot. Called by the
 *                  fx_rates_trigger_fetch() pg_cron job every day.
 *   • "backfill" — pulls the ECB 90-day history feed in one call, to seed a
 *                  real starting snapshot (one-time, or to heal a gap after
 *                  an outage). Safe to re-run — every row is an idempotent
 *                  upsert keyed on (base, quote, as_of, source).
 *
 * Auth: the cron path carries a shared secret (x-fx-rates-secret, matched
 * against FX_RATES_FETCH_SECRET); a signed-in admin's JWT can also trigger
 * either mode on demand (e.g. to run the one-time backfill, or re-pull after
 * fixing a gap) — mirrors changelog-digest's dual-auth shape.
 *
 * Every currency the feed reports is checked against the `currencies` catalog
 * before being written — unsupported codes are dropped and reported in the
 * response (never silently grown into fx_rates).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ECB_DAILY_URL_DEFAULT, ECB_HIST90_URL_DEFAULT, parseEcbXml, toFxRateRows } from "../_shared/ecbFx.ts";
import { slog, timed } from "../_shared/observability.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fx-rates-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const ECB_DAILY_URL = Deno.env.get("ECB_FX_DAILY_URL") ?? ECB_DAILY_URL_DEFAULT;
const ECB_HIST90_URL = Deno.env.get("ECB_FX_HIST90_URL") ?? ECB_HIST90_URL_DEFAULT;

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

/** GET with a small bounded retry — the feed has no auth/rate-limit, just occasional transient failures. */
async function fetchWithRetry(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      lastErr = new Error(`ecb_http_${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const mode: "daily" | "backfill" = body?.mode === "backfill" ? "backfill" : "daily";

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // ---- Auth: shared cron secret, or a signed-in admin's JWT ------------------
  const expected = Deno.env.get("FX_RATES_FETCH_SECRET");
  const hasSecret = !!expected && req.headers.get("x-fx-rates-secret") === expected;
  if (!hasSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email) return json({ error: "unauthorized" }, 401);
    const { data: adminRow } = await userClient
      .from("admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
    if (!adminRow) return json({ error: "forbidden" }, 403);
  }

  try {
    const result = await timed("fx-rates-fetch", "ecb_fetch", async () => {
      const fetchUrl = mode === "backfill" ? ECB_HIST90_URL : ECB_DAILY_URL;
      const xml = await fetchWithRetry(fetchUrl);
      const days = parseEcbXml(xml);
      if (days.length === 0) throw new Error("ecb_parse_empty");

      const { data: catalog, error: catErr } = await service
        .from("currencies").select("code").eq("is_active", true);
      if (catErr) throw new Error(`catalog_lookup_failed: ${catErr.message}`);
      const activeCodes = new Set((catalog ?? []).map((c: { code: string }) => c.code as string));

      const { rows, skipped } = toFxRateRows(days, activeCodes);
      if (skipped.length) {
        slog("fx-rates-fetch", "unsupported_currencies_skipped", "warn", { mode, codes: skipped.join(",") });
      }
      if (rows.length === 0) return { days: days.length, upserted: 0, skipped };

      const { error: upErr } = await service
        .from("fx_rates")
        .upsert(rows, { onConflict: "base_currency,quote_currency,as_of,source" });
      if (upErr) throw new Error(`upsert_failed: ${upErr.message}`);

      return { days: days.length, upserted: rows.length, skipped };
    }, { mode });

    return json({ ok: true, mode, ...result });
  } catch (e) {
    return json({ ok: false, mode, error: String((e as Error).message).slice(0, 300) }, 502);
  }
};

if (import.meta.main) Deno.serve(handler);
