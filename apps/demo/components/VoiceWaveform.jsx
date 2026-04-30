import React from "react";
// @keyframes voiceBar is defined in styles/components.css.
// Props:
//   bars        — seeded height array from parent (values in px)
//   isRecording — only renders when true
export default function VoiceWaveform({ bars, isRecording }) {
  if (!isRecording) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 52 }}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: `${h}px`,
            borderRadius: "var(--r-pill)",
            background: "rgba(255,255,255,0.8)",
            animation: `voiceBar ${0.4 + (i % 5) * 0.09}s ease-in-out infinite alternate`,
            animationDelay: `${(i * 0.06) % 0.8}s`,
          }}
        />
      ))}
    </div>
  );
}
