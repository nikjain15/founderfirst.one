/**
 * Penny dock — the standing chat (owner-calm redesign).
 *
 * Penny is no longer a slab pinned to the bottom of Home. She's a launcher present on
 * EVERY owner tab (Home · Review · Reports · Connections); clicking it opens a
 * slide-over panel hosting the same grounded PennyThread conversation, and that
 * conversation is remembered per org (PennyThread persists it). Ask her anything, at
 * any point — the answers are still computed from the real books, to the cent.
 *
 * Rendered ONCE at the Ledger root so it floats over whichever tab is active; the
 * thread stays mounted while closed, so a question in progress isn't lost on toggle.
 */
import { useEffect, useState } from "react";
import type { JournalEntry } from "./types";
import PennyThread from "./PennyThread";
import { COPY } from "../copy";

export default function PennyDock({
  orgId, entries, canWrite,
}: {
  orgId: string; entries: JournalEntry[]; canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Esc closes the panel — standard slide-over affordance.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`penny-launcher${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls="penny-dock-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
        <span className="penny-launcher-label">{COPY.thread.dockOpen}</span>
      </button>

      {open && (
        <>
          <div className="penny-dock-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            id="penny-dock-panel"
            className="penny-dock"
            role="dialog"
            aria-label={COPY.thread.title}
          >
            <div className="penny-dock-head">
              <span className="penny-dock-title">
                <span className="p-mark p-mark-sm" aria-hidden="true">P</span> {COPY.thread.title}
              </span>
              <button
                type="button"
                className="penny-dock-close ghost sm"
                aria-label={COPY.thread.dockClose}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="penny-dock-body">
              {/* key={orgId} → switching books loads that org's remembered history. */}
              <PennyThread key={orgId} orgId={orgId} entries={entries} canWrite={canWrite} compact />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
