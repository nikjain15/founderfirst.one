import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * The "so what / now what" line every data screen leads with.
 *
 * Principle #6 (admin): a screen should tell you what to do, not just show
 * numbers. Drop one <Takeaway> above the charts with a computed headline and,
 * where there's an obvious next step, an action link. Reused everywhere so the
 * pattern is learnable for free (principle #7).
 *
 *   good    — on track / nothing to do
 *   watch   — needs attention or a decision
 *   neutral — context, no judgement
 */
type Tone = "good" | "watch" | "neutral";

export function Takeaway({
  tone = "neutral",
  children,
  action,
}: {
  tone?: Tone;
  children: ReactNode;
  action?: { label: string; to: string };
}) {
  return (
    <div className={`takeaway takeaway-${tone}`} role="status">
      <span className="takeaway-dot" aria-hidden />
      <span className="takeaway-text">{children}</span>
      {action && (
        <Link to={action.to} className="takeaway-action">
          {action.label}
        </Link>
      )}
    </div>
  );
}
