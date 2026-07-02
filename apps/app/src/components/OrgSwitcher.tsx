/**
 * Org switcher — a branded, accessible dropdown replacing the raw native <select>
 * (which rendered an unstyled OS popup). Listbox semantics: trigger button +
 * role="listbox" of role="option"s. Dismisses on outside-click or Escape;
 * ArrowUp/Down/Home/End move focus, Enter/click selects. The active-org switch
 * itself is unchanged — it still calls setActiveOrgId.
 */
import { useEffect, useRef, useState } from "react";
import { COPY } from "../copy";

type Org = { id: string; name: string; type: string };

function Chevron() {
  return (
    <svg className="orgsw-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function OrgSwitcher({
  orgs, activeOrg, onSelect, onCreateOrg,
}: {
  orgs: Org[]; activeOrg: Org | null; onSelect: (id: string) => void;
  // "+ New organization" / "+ Add client" lives here (APP_PRINCIPLES §5), not on
  // the page body — the switcher is where a user goes to change which books they're in.
  onCreateOrg?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Dismiss on outside-click or Escape (mirrors the account menu).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // On open, move focus to the selected option so keyboard users land in place.
  useEffect(() => {
    if (!open) return;
    const opts = ref.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const sel = ref.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    (sel ?? opts?.[0])?.focus();
  }, [open]);

  const pick = (id: string) => { onSelect(id); setOpen(false); triggerRef.current?.focus(); };

  function onOptionKey(e: React.KeyboardEvent, i: number) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const opts = ref.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!opts?.length) return;
    const n = opts.length;
    const j = e.key === "ArrowDown" ? (i + 1) % n
      : e.key === "ArrowUp" ? (i - 1 + n) % n
      : e.key === "Home" ? 0 : n - 1;
    opts[j].focus();
  }

  if (orgs.length === 0) return null;

  return (
    <div className="orgsw" ref={ref}>
      <button
        ref={triggerRef} type="button" className="orgsw-trigger"
        aria-haspopup="listbox" aria-expanded={open} aria-label={COPY.nav.switchOrgAria}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { e.preventDefault(); setOpen(true); } }}
      >
        <span className="orgsw-current">
          <span className="orgsw-name">{activeOrg?.name ?? COPY.nav.selectOrg}</span>
          {activeOrg && <span className="orgsw-type">{activeOrg.type}</span>}
        </span>
        <Chevron />
      </button>
      {open && (
        <ul className="orgsw-menu" role="listbox" aria-label={COPY.nav.orgsAria}>
          {orgs.map((o, i) => (
            <li key={o.id} role="option" aria-selected={o.id === activeOrg?.id}>
              <button
                type="button" className={`orgsw-item${o.id === activeOrg?.id ? " on" : ""}`}
                onClick={() => pick(o.id)} onKeyDown={(e) => onOptionKey(e, i)}
              >
                <span className="orgsw-item-text">
                  <span className="orgsw-item-name">{o.name}</span>
                  <span className="orgsw-item-type">{o.type}</span>
                </span>
                {o.id === activeOrg?.id && <Check />}
              </button>
            </li>
          ))}
          {onCreateOrg && (
            // Not a selectable option — it's an action. role="presentation" keeps the
            // listbox's children valid (a bare <li> inside role="listbox" is invalid
            // ARIA and confuses screen readers). Reachable by Tab; arrow keys cycle the
            // real options above it.
            <li className="orgsw-foot" role="presentation">
              <button
                type="button" className="orgsw-item orgsw-create"
                onClick={() => { setOpen(false); triggerRef.current?.focus(); onCreateOrg(); }}
              >
                {COPY.nav.newOrg}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
