/**
 * Live soak driver — the PostBackend that drives the REAL post_journal_entry RPC
 * against a sandbox Supabase project with namespaced, purgeable fixtures.
 *
 * This module is imported by the CLI (soak.ts) only after assertLiveRunAllowed()
 * has fenced the run to a sandbox target. It is intentionally NOT imported by the
 * CI smoke test (which uses the in-memory model), so CI needs no @supabase/supabase-js
 * and no credentials.
 *
 * It reuses the org's existing accounts if present, else it seeds two namespaced
 * accounts, so a run is repeatable. It never mutates the ledger posting RPC — it
 * only CALLS it (read of the additive slice: exercise, don't modify).
 */

import type { PostBackend } from "./runner.ts";
import type { PostRequest } from "./model.ts";
import type { SoakConfig } from "./config.ts";

// Minimal structural type — avoids a hard dependency in this file's typecheck.
interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface LiveFixtures {
  orgId: string;
  actorId: string;
  cashAccountId: string;
  revAccountId: string;
}

/**
 * The live backend. `post()` maps a model PostRequest onto the real RPC's line
 * shape ({ account_id, side, amount_minor }) and detects a replay by comparing the
 * returned entry's idempotency_key echo — the RPC returns the ORIGINAL row on a
 * replay, so a second call with the same key yields the same entry id.
 */
export class LiveLedgerBackend implements PostBackend {
  private seenEntryIds = new Set<string>();

  constructor(
    private svc: RpcClient,
    private fx: LiveFixtures,
  ) {}

  async post(req: PostRequest): Promise<{ id: string; created: boolean }> {
    const lines = req.lines.map((l) => ({
      account_id: l.side === "D" ? this.fx.cashAccountId : this.fx.revAccountId,
      side: l.side,
      amount_minor: l.amount_minor,
    }));
    const { data, error } = await this.svc.rpc("post_journal_entry", {
      p_actor: this.fx.actorId,
      p_org: this.fx.orgId,
      p_entry_date: new Date().toISOString().slice(0, 10),
      p_idempotency_key: req.idempotency_key,
      p_lines: lines,
      p_source: "soak-harness",
    });
    if (error) throw new Error(`rpc_error: ${error.message}`);
    const entry = data as { id: string };
    const created = !this.seenEntryIds.has(entry.id);
    this.seenEntryIds.add(entry.id);
    return { id: entry.id, created };
  }
}

/**
 * Build the live Supabase client. Kept as a dynamic import so the package
 * typechecks and the CI smoke test runs WITHOUT @supabase/supabase-js installed.
 */
export async function makeLiveBackend(cfg: SoakConfig, fx: LiveFixtures): Promise<LiveLedgerBackend> {
  // @ts-ignore — resolved only at runtime on a live sandbox run; not a CI dep.
  const mod = await import("@supabase/supabase-js");
  const svc = mod.createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as RpcClient;
  return new LiveLedgerBackend(svc, fx);
}
