import { useEffect, useState } from "react";

/**
 * Learning loop "Act" — assignment island. Reads a PostHog multivariate feature
 * flag (keyed by experiment.key), renders the assigned arm's text for one field,
 * and fires a single exposure per experiment. Because PostHog auto-attaches the
 * active flag to every subsequent event, the downstream signup (the primary
 * metric) is automatically attributed to the arm — no manual tagging needed.
 *
 * Cookieless-friendly: feature flags resolve in the anonymous tier too, so
 * experiments run for everyone (Option B), not just consenters.
 */
const fired = new Set<string>();

export default function ExperimentText({
  flag, variants, fallback, as = "span",
}: {
  flag: string;
  variants: Record<string, string>;   // variant_key → text
  fallback: string;                   // control / no-flag text
  as?: keyof JSX.IntrinsicElements;
}) {
  const [val, setVal] = useState(fallback);

  useEffect(() => {
    const ph = (window as any).posthog;
    if (!ph?.onFeatureFlags) return;
    const apply = () => {
      const v = ph.getFeatureFlag?.(flag);
      const variant = typeof v === "string" ? v : "control";
      setVal(typeof v === "string" && variants[v] != null ? variants[v] : fallback);
      if (!fired.has(flag)) {
        fired.add(flag);
        ph.capture?.("experiment_exposure", { experiment: flag, variant, product: "website" });
      }
    };
    apply();                               // resolve immediately if flags are ready
    const unsub = ph.onFeatureFlags(apply); // …and when they load
    return () => { try { unsub?.(); } catch { /* noop */ } };
  }, [flag, fallback]);

  const Tag = as as any;
  return <Tag>{val}</Tag>;
}
