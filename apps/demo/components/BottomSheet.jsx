/**
 * components/Sheet.jsx — canonical bottom sheet.
 *
 * Every bottom sheet in the demo (founder app + CPA view) renders through this
 * component. Never roll your own. See CLAUDE.md "Shared components catalog"
 * for full usage rules.
 *
 * Portal target defaults to #sheet-root (inside .phone). CPA view sheets pass
 * portalTarget="#sheet-root-cpa" (inside .cpa-app).
 *
 * Positioning: position: absolute throughout — never position: fixed.
 * Animation: sheet-slide-up keyframe from styles/components.css.
 * Dismissal: backdrop click, ESC key. Clicks inside the sheet do not bubble.
 *
 * Props:
 *   open             — boolean
 *   onClose          — function to run on dismissal
 *   title            — optional header string
 *   subtitle         — optional descriptor line under the title
 *   maxHeight        — CSS value for sheet max-height (default "70%")
 *   footerActions    — optional React node, rendered as sticky bottom row
 *   portalTarget     — CSS selector for portal mount (default "#sheet-root")
 *   ariaLabelledBy   — optional id of labelling element (auto-filled when title is set)
 *   ariaLabel        — fallback label for screen readers when no title
 *   layout           — "standard" (default): wraps children in .sheet-body
 *                      (title/subtitle → .sheet-header; footerActions → .sheet-footer).
 *                      "custom": renders children directly between the handle and the
 *                      sheet's bottom edge. Use for sheets with a tab bar, split
 *                      scroll regions, or other bespoke layouts. In "custom",
 *                      title/subtitle/footerActions are ignored — provide them in children.
 *   children         — sheet body content
 */

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  maxHeight = "70%",
  footerActions,
  portalTarget = "#sheet-root",
  ariaLabelledBy,
  ariaLabel,
  layout = "standard",
  children,
}) {
  const sheetRef = useRef(null);
  const titleId = useId();
  const resolvedLabelledBy = ariaLabelledBy || (title ? titleId : undefined);

  // Focus the sheet when it opens (matches prior CategorySheet pattern)
  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);

  // ESC to close — a11y and keyboard parity with iOS sheet dismissal
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
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={resolvedLabelledBy}
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        {layout === "custom" ? (
          children
        ) : (
          <>
            {(title || subtitle) && (
              <div className="sheet-header">
                {title && (
                  <p id={titleId} className="sheet-title">
                    {title}
                  </p>
                )}
                {subtitle && <p className="sheet-subtitle">{subtitle}</p>}
              </div>
            )}
            <div className="sheet-body">{children}</div>
            {footerActions && <div className="sheet-footer">{footerActions}</div>}
          </>
        )}
      </div>
    </div>,
    target
  );
}
