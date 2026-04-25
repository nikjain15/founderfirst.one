import React, { useEffect } from "react";
// Canonical toast — position: absolute, never fixed.
// bottom defaults to 80px (above tab bar in phone context).
// CPA screens pass bottom={24} (no tab bar).
export default function Toast({ message, onDone, duration = 2400, bottom = 80 }) {
  useEffect(() => {
    if (!message || !onDone) return;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDone]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        bottom,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--ink)",
        color: "var(--white)",
        fontSize: 13,
        fontWeight: "var(--fw-medium)",
        padding: "10px 18px",
        borderRadius: "var(--r-pill)",
        whiteSpace: "nowrap",
        zIndex: 300,
        boxShadow: "0 4px 16px rgba(10,10,10,0.18)",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}
