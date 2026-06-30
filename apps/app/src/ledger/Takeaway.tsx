/**
 * The "so what / now what" line a data screen leads with — the app twin of the
 * admin's Takeaway (apps/admin/src/lib/Takeaway.tsx), same look + tones so the
 * two products feel like one (ADMIN_PRINCIPLES #6 lead-with-so-what, #7
 * inherit-the-pattern). The app navigates by tab callback rather than route, so
 * the optional action is an onClick instead of a Link.
 *
 *   good    — on track / nothing to do
 *   watch   — needs attention or a decision
 *   neutral — context, no judgement
 */
import type { ReactNode } from "react";

type Tone = "good" | "watch" | "neutral";

export function Takeaway({
  tone = "neutral", children, action,
}: {
  tone?: Tone;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`takeaway takeaway-${tone}`} role="status">
      <span className="takeaway-dot" aria-hidden />
      <span className="takeaway-text">{children}</span>
      {action && (
        <button type="button" className="takeaway-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
