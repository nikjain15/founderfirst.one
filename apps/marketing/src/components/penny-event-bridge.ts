/**
 * Bridge between the Penny widget (site-bubble) and our analytics layer.
 *
 * The bubble lives in its own bundle (no Supabase). It dispatches
 * `CustomEvent("penny:event", { detail: { name, props } })` on window;
 * we forward to track() here so the same anon_id + consent rules apply.
 */
import { track } from "../lib/analytics";

interface PennyEventDetail {
  name:  string;
  props?: Record<string, unknown>;
}

export function initPennyEventBridge(): void {
  window.addEventListener("penny:event", (e: Event) => {
    const detail = (e as CustomEvent<PennyEventDetail>).detail;
    if (!detail?.name) return;
    track(detail.name, detail.props ?? {});
  });
}
