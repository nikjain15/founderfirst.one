/*
 * Inline SVG icon set. Style mirrors marketing site:
 * - 24×24 viewBox, currentColor stroke, stroke-width 1.5
 * - round line caps/joins
 * - default rendered size 16px (override with `size` prop)
 *
 * Keep tiny. Add new icons here only when actually used.
 */

type IconProps = {
  size?: number;
  className?: string;
  "aria-label"?: string;
};

function base({ size = 16, className, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": rest["aria-label"] ? undefined : true,
    role: rest["aria-label"] ? "img" : undefined,
    className,
    ...rest,
  };
}

export function IconExternalLink(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export function IconSettings(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function IconGlobe(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

export function IconDiscord(p: IconProps = {}) {
  // Simplified Discord glyph as monoline strokes to match the rest of the set.
  return (
    <svg {...base(p)}>
      <path d="M8 9a8 8 0 0 1 8 0" />
      <path d="M5 7l2.5 1M19 7l-2.5 1" />
      <path d="M7 17l-1.5 2c-1-.5-2-1.5-2.5-3l1-7c.5-1.5 2-2.5 3.5-3" />
      <path d="M17 17l1.5 2c1-.5 2-1.5 2.5-3l-1-7c-.5-1.5-2-2.5-3.5-3" />
      <circle cx="9.5" cy="13" r="1" />
      <circle cx="14.5" cy="13" r="1" />
    </svg>
  );
}

export function IconSend(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M22 2 11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

export function IconCheck(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconAlert(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

export function IconArrowLeft(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function IconLogOut(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function IconInbox(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5h13l3 7v6a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-6l3-7z" />
    </svg>
  );
}

export function IconChevronDown(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconMenu(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function IconClose(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function IconThumbsUp(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function IconThumbsDown(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
      <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

export function IconLightbulb(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.05V17h6v-.25c0-.85.4-1.55 1-2.05A7 7 0 0 0 12 2z" />
    </svg>
  );
}

export function IconVolume(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

export function IconPlay(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M5 3l14 9-14 9V3z" />
    </svg>
  );
}

export function channelIcon(channel: string, size = 14) {
  if (channel === "discord") return <IconDiscord size={size} />;
  return <IconGlobe size={size} />;
}
