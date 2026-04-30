/**
 * components/FullScreenOverlay.jsx — canonical dark-scrim overlay.
 *
 * Used for full-viewport modal states (voice recording, photo capture
 * processing, pulling-data screen). Different from <Sheet> which slides up
 * from the bottom — this is a full-coverage scrim with centered content.
 *
 * Every dark-scrim overlay in the demo renders through this component. Never
 * roll your own. See CLAUDE.md "Shared components catalog" for usage rules.
 *
 * Portal target defaults to #sheet-root (inside .phone). CPA view overlays
 * pass portalTarget="#sheet-root-cpa".
 *
 * Positioning: position: absolute — never position: fixed.
 *
 * Props:
 *   open          — boolean
 *   onClose       — optional. If provided, ESC dismisses. Voice/photo overlays
 *                   that auto-dismiss omit this.
 *   scrim         — background CSS value. Defaults to rgba(10,10,10,0.92).
 *                   Permitted values are rgba(10,10,10,N) only — no raw hex.
 *   portalTarget  — CSS selector for portal mount (default "#sheet-root")
 *   ariaLabel     — screen-reader label for the modal
 *   children      — centered content (caller lays out via flex)
 */

import React, { useEffect } from "react";
import { createPortal } from "react-dom";

export default function FullScreenOverlay({
  open,
  onClose,
  scrim = "rgba(10,10,10,0.92)",
  portalTarget = "#sheet-root",
  ariaLabel,
  children,
}) {
  // ESC closes the overlay when onClose is provided. Auto-dismissing overlays
  // (e.g. PhotoOverlay's 1.6s timer) pass no onClose and no key handler runs.
  useEffect(() => {
    if (!open || !onClose) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const target =
    document.querySelector(portalTarget) ||
    document.querySelector(".phone") ||
    document.body;

  return createPortal(
    <div
      className="fullscreen-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      style={{ background: scrim }}
    >
      {children}
    </div>,
    target
  );
}
