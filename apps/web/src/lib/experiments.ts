import { createClient } from "@supabase/supabase-js";

/**
 * Learning loop "Act" — load RUNNING experiments at build time so the page can
 * render the right variant per visitor. Assignment itself is decided client-side
 * by a PostHog multivariate flag keyed by `experiment.key`; here we just ship the
 * arm payloads to the browser. RLS exposes only running experiments to anon.
 */
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export interface ExpArm { variant_key: string; payload: Record<string, unknown>; is_control: boolean }
export interface Experiment {
  key: string;
  section_type: string;
  primary_metric: string;
  arms: ExpArm[];
}

/** Running experiments keyed by the section_type they target. One per section. */
export async function getRunningExperiments(): Promise<Record<string, Experiment>> {
  if (!url || !anon) return {};
  try {
    const db = createClient(url, anon);
    const { data: exps } = await db
      .from("experiments")
      .select("key, section_type, primary_metric")
      .eq("status", "running");
    if (!exps?.length) return {};
    const { data: arms } = await db
      .from("experiment_arms")
      .select("experiment_id, variant_key, payload, is_control, experiments!inner(key, status)")
      .eq("experiments.status", "running");
    const byKey: Record<string, ExpArm[]> = {};
    for (const a of arms ?? []) {
      const k = (a as any).experiments.key as string;
      (byKey[k] ??= []).push({ variant_key: a.variant_key, payload: a.payload, is_control: a.is_control });
    }
    const out: Record<string, Experiment> = {};
    for (const e of exps) {
      out[e.section_type] = { key: e.key, section_type: e.section_type, primary_metric: e.primary_metric, arms: byKey[e.key] ?? [] };
    }
    return out;
  } catch {
    return {}; // never let an experiment fetch break the build
  }
}
