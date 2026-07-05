/**
 * CompactEmpty (PENNY-UX-10) — a single-line empty state (dot + one line + optional
 * action), the density fix for the owner Review stack where several surfaces stack
 * vertically. Replaces the full-height `.ledger-empty` / `.empty` billboards so an
 * all-quiet Review reads as a few tidy rows, mirroring founderfirst.one/admin.
 *
 * Layout/CSS only — no logic. Styles live in styles.css (.compact-empty). All text
 * is passed in from the COPY catalog (CENTRAL-1); this component holds no strings.
 */
export function CompactEmpty({
  text, action,
}: {
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="compact-empty">
      <span className="ce-dot" aria-hidden="true" />
      <span className="ce-text">{text}</span>
      {action && (
        <button className="ghost sm ce-action" onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  );
}
