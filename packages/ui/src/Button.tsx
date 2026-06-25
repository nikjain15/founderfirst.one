/**
 * Button — the first shared primitive, proving the @ff/ui pattern:
 *   - styled ONLY through design-system tokens (no inline hex / px),
 *   - fluid + ≥44px tap target by construction (RESPONSIVE.md rule 3),
 *   - one component → marketing, admin, blog, bubble.
 *
 * Phase 2 fleshes out the full library (Nav, Footer, CookieBanner, Hero,
 * TransactionCard, ComparisonDiagram, PhoneFrame, WaitlistForm, FAQ).
 */
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "white";

const base: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  minHeight: "var(--tap-min)",
  padding: "0 var(--space-5)",
  borderRadius: "var(--r-pill)",
  fontFamily: "var(--font-sans)",
  fontWeight: "var(--fw-medium)" as unknown as number,
  fontSize: "var(--fs-ui)",
  cursor: "pointer",
  border: "var(--bw) solid transparent",
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--brand)", color: "#fff" },
  ghost: { background: "transparent", color: "var(--ink)", borderColor: "var(--ink)" },
  white: { background: "var(--white)", color: "var(--ink)" },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", style, ...rest }: ButtonProps) {
  return <button style={{ ...base, ...variants[variant], ...style }} {...rest} />;
}
