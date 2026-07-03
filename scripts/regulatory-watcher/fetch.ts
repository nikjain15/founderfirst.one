// LOOP-2 — the fetch/extract layer.
//
// Turns watched sources into candidate LawChangeSignals. Two deliberate design
// choices, both in service of "false-positive-safe: no detection = no PR":
//
//  1. DEFAULT: emit NOTHING. Fetching an IRS page and reliably deciding "a
//     threshold changed" from free-text is an NLP problem where a false positive
//     drafts a WRONG law PR — the most dangerous failure for this routine. So the
//     baseline extractor fetches each source (to confirm reachability + capture a
//     content hash for change-detection audit) but emits no signal on its own.
//     A run with no confirmed signal logs "no change" and opens no PR. This is
//     correct, not incomplete: the routine is trustworthy precisely because it
//     will not invent a law change.
//
//  2. CONFIRMED-CHANGE INJECTION: the scheduled agent (or a human who has read the
//     source) supplies the extracted change via the REG_WATCHER_SIGNALS env var
//     (a JSON array of LawChangeSignal). The pure detector (detect.ts) then decides
//     if it is new/material and drafts the seed-diff PR. This keeps a human/agent
//     judgment in the extraction step while the mechanical, provable part (diff +
//     effective-dating + consumer impact + PR) is fully automated and tested.
//
// Turning on automated free-text extraction (LLM-assisted, with the primary-source
// corroboration rule from sources.json) is a follow-up `decision-needed` — it adds
// an inference dependency and a false-positive budget, which is Nik's call, not a
// builder's (Roadmap principle 4 / mission #4).

import { createHash } from "node:crypto";
import type { LawChangeSignal, WatchedSource } from "./types.js";

/** Fetch a source and return a content hash (for change-detection audit trail).
 *  Network failure is non-fatal: it's logged and the source is skipped, never a
 *  reason to draft a spurious PR. */
async function probe(src: WatchedSource): Promise<{ id: string; ok: boolean; hash?: string }> {
  try {
    const res = await fetch(src.url, { headers: { "user-agent": "founderfirst-regwatcher/1" } });
    if (!res.ok) return { id: src.id, ok: false };
    const body = await res.text();
    return { id: src.id, ok: true, hash: createHash("sha256").update(body).digest("hex").slice(0, 16) };
  } catch {
    return { id: src.id, ok: false };
  }
}

/** Signals injected by the scheduled agent / a human reviewer via env, if any. */
function injectedSignals(): LawChangeSignal[] {
  const raw = process.env.REG_WATCHER_SIGNALS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LawChangeSignal[]) : [];
  } catch {
    process.stderr.write("[reg-watcher] REG_WATCHER_SIGNALS is not valid JSON — ignoring (no signal).\n");
    return [];
  }
}

/** Produce candidate signals from the watched sources. See file header: the
 *  baseline probes for reachability + a content hash but does NOT auto-extract;
 *  confirmed changes arrive via REG_WATCHER_SIGNALS. */
export async function extractSignals(sources: WatchedSource[]): Promise<LawChangeSignal[]> {
  const probes = await Promise.all(sources.map(probe));
  for (const p of probes) {
    process.stdout.write(
      `[reg-watcher] source ${p.id}: ${p.ok ? `reachable (hash ${p.hash})` : "UNREACHABLE — skipped"}\n`,
    );
  }
  const injected = injectedSignals();
  if (injected.length) {
    process.stdout.write(`[reg-watcher] ${injected.length} confirmed signal(s) injected via REG_WATCHER_SIGNALS.\n`);
  }
  return injected;
}
