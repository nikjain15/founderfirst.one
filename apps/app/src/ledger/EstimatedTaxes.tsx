/**
 * W2.4 · Quarterly estimated-tax strip on owner Home.
 *
 * Grounded on the org's REAL ledger P&L (the same entries Home/Reports render) +
 * law-derived rate params (kernel, via useEstimatedTaxBasis) + the kernel filing
 * calendar (useUpcomingDeadlines, kind='estimate'). Zero rates/deadlines hardcoded
 * — every number flows in from the ledger, params, or the calendar. All copy comes
 * from the CENTRAL-1 catalog. Always shows the "not tax advice" disclaimer when a
 * number is present, and cleanly omits the number (never fakes one) when the org
 * has no tax profile, no seeded params, or no profit yet.
 *
 * This wires the strip W3.4 left intentionally absent ("belongs to W2.4"); with
 * this live, W3.4's conditional now renders.
 */
import { useMemo } from "react";
import { useEstimatedTaxBasis, useUpcomingDeadlines } from "./api";
import {
  estimateForYear,
  nextEstimateDeadline,
  penaltyLevel,
  type EstimateComponent,
} from "./estimatedTax";
import { formatMoney } from "./money";
import type { JournalEntry } from "./types";
import { COPY } from "../copy";

// Percentage → a plain "30%" string for the set-aside line. Pure display.
const pctLabel = (frac: number) => `${Math.round(frac * 100)}%`;

// A conservative default for "how many days before a deadline do we nudge".
// Deliberately not a magic threshold that changes behavior — it only controls
// when a reminder appears, and the deadline itself is 100% kernel-driven.
const WARN_WITHIN_DAYS = 21;

const componentLabel = (c: EstimateComponent): string => {
  switch (c.labelKey) {
    case "selfEmployment": return COPY.estimatedTax.selfEmployment;
    case "federalIncome": return COPY.estimatedTax.federalIncome;
    case "stateIncome": return COPY.estimatedTax.stateIncome;
    case "corporate": return COPY.estimatedTax.corporate;
    default: return c.labelKey;
  }
};

export default function EstimatedTaxes({
  entries,
  orgId,
  asOf = new Date(),
}: {
  entries: JournalEntry[];
  orgId: string;
  asOf?: Date;
}) {
  const taxYear = asOf.getFullYear();
  const basisQ = useEstimatedTaxBasis(orgId, taxYear);
  const deadlinesQ = useUpcomingDeadlines(orgId);

  const est = useMemo(() => {
    if (!basisQ.data) return null;
    return estimateForYear(entries, basisQ.data, taxYear);
  }, [entries, basisQ.data, taxYear]);

  const deadline = useMemo(
    () => nextEstimateDeadline(deadlinesQ.data ?? []),
    [deadlinesQ.data],
  );

  // Still loading the grounded params → render nothing (the strip appears once we
  // have a real basis, exactly like the other Home strips).
  if (basisQ.isLoading || !est) return null;

  const currency = basisQ.data?.currency ?? "USD";
  const money = (m: number) => formatMoney(m, currency);

  // Unavailable states: show the reason, never a number.
  if (est.status !== "ok") {
    const msg =
      est.status === "no_profile" ? COPY.estimatedTax.noProfile
      : est.status === "no_params" ? COPY.estimatedTax.noParams
      : est.status === "no_estimate_entity" ? COPY.estimatedTax.noEstimateEntity
      : COPY.estimatedTax.noProfit;
    return (
      <section className="home-estimated-tax">
        <h2 className="section-h">{COPY.estimatedTax.title}</h2>
        <p className="muted">{msg}</p>
      </section>
    );
  }

  const level = penaltyLevel(deadline, est.perQuarterMinor, WARN_WITHIN_DAYS);

  return (
    <section className="home-estimated-tax">
      <h2 className="section-h">{COPY.estimatedTax.title}</h2>

      {/* Headline: this quarter's estimated payment (safe-harbor, even split). */}
      <div className={`et-headline${level === "overdue" ? " t-warn" : ""}`}>
        <span className="et-amount">{COPY.estimatedTax.perQuarter(money(est.perQuarterMinor))}</span>
        <span className="et-sub muted sm">{COPY.estimatedTax.perQuarterSub(est.taxYear)}</span>
      </div>

      {/* Set-aside guidance. */}
      {est.setAsidePct != null && (
        <p className="et-setaside sm">
          {COPY.estimatedTax.setAside(pctLabel(est.setAsidePct), money(est.setAsideMinor))}
        </p>
      )}

      {/* Breakdown — the components that make up the annual estimate. */}
      <ul className="et-breakdown">
        {est.components.map((c) => (
          <li key={c.key} className="et-line">
            <span className="et-line-label">{componentLabel(c)}</span>
            <span className="et-line-amt">{money(c.amountMinor)}</span>
          </li>
        ))}
        <li className="et-line et-total">
          <span className="et-line-label">{COPY.estimatedTax.breakdownTotal(money(est.totalAnnualMinor))}</span>
        </li>
      </ul>

      {/* Deadline + penalty nudge (date-driven from the kernel calendar). */}
      {deadline && (
        <p className={`et-deadline sm${level !== "none" ? " is-soon" : ""}`}>
          {deadline.label} · {COPY.estimatedTax.dueSoon(deadline.days_until, deadline.due_date)}
        </p>
      )}
      {level === "overdue" && deadline && (
        <p className="et-penalty t-warn sm">{COPY.estimatedTax.overdue(deadline.due_date)}</p>
      )}
      {level === "soon" && <p className="et-penalty sm">{COPY.estimatedTax.penaltySoon}</p>}

      {/* The standing disclaimer — always present when a number shows. */}
      <p className="et-disclaimer muted sm">
        {COPY.estimatedTax.disclaimer}
        {est.citation && (
          <>
            {" "}
            <a href={est.citation} target="_blank" rel="noopener noreferrer">
              {COPY.estimatedTax.learnMore}
            </a>
          </>
        )}
      </p>
    </section>
  );
}
