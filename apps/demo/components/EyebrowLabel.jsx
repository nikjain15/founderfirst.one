import React from "react";
// Wraps the .eyebrow CSS class. Use this instead of recreating eyebrow
// typography with inline styles.
// The `style` prop is for margin/padding overrides only.
export default function EyebrowLabel({ children, style }) {
  return <p className="eyebrow" style={style}>{children}</p>;
}
