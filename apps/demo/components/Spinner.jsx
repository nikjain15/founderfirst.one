import React from "react";
// @keyframes spin is defined in styles/components.css
export default function Spinner({ size = 20, color = "var(--ink)" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite", display: "block" }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray="40 20"
        strokeLinecap="round"
      />
    </svg>
  );
}
