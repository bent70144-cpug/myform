/**
 * Shared STYLE TOKENS for the web app (pure TypeScript — no JSX, no React
 * runtime import beyond the CSSProperties type). Safe for every compiler
 * pipeline, including the vitest/esbuild classic-JSX transform used by the
 * public-form tests (which must not pull in next/link).
 *
 * The app deliberately has NO CSS framework (spec visual language): every
 * component styles itself through inline styles, and THIS module owns the
 * tokens so the visual language stays coherent across every page — slate ink
 * on white, hairline borders, soft gray surfaces (system-ui throughout).
 */
import type { CSSProperties } from "react";

/** Color tokens — the app's visual language. */
export const C = {
  ink: "#1f2937",
  muted: "#555555",
  faint: "#8a8f98",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  soft: "#f9fafb",
  white: "#ffffff",
  danger: "#b00020",
  dangerBg: "#fdf2f3",
  dangerBorder: "#f0c4ca",
  success: "#0a7d32",
  successBg: "#f0faf2",
  successBorder: "#c9ead2",
  warning: "#7c4a03",
  warningBg: "#fdf6e3",
  warningBorder: "#eedfb2",
  info: "#1f2937",
  infoBg: "#f9fafb",
  /** Fixed-overlay backdrop: translucent ink (modals, drawers, sheets). */
  overlay: "rgba(31, 41, 55, 0.45)",
} as const;

const RADIUS = "10px";

/** Elevation levels. `sm` is the original card shadow, unchanged. */
export const shadow = {
  sm: "0 1px 2px rgba(15, 23, 42, 0.05)",
  md: "0 4px 12px rgba(15, 23, 42, 0.1)",
  lg: "0 16px 40px rgba(15, 23, 42, 0.18)",
} as const;

/** Fluid page container (dashboard-style pages). */
export const page: CSSProperties = {
  width: "100%",
  maxWidth: 880,
  margin: "0 auto",
  padding: "1.5rem 1.25rem 3rem",
  boxSizing: "border-box",
};

/** Narrow centered container (auth/status pages). */
export const pageNarrow: CSSProperties = {
  ...page,
  maxWidth: 480,
};

export const card: CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS,
  boxShadow: shadow.sm,
  padding: "1.25rem",
  boxSizing: "border-box",
};

/** Soft (gray) panel for secondary content. */
export const softCard: CSSProperties = {
  ...card,
  background: C.soft,
  boxShadow: "none",
};

export const h1: CSSProperties = {
  fontSize: "1.6rem",
  lineHeight: 1.25,
  margin: "0 0 0.35rem",
  letterSpacing: "-0.01em",
};

export const h2: CSSProperties = {
  fontSize: "1.15rem",
  margin: "0 0 0.5rem",
};

export const muted: CSSProperties = {
  color: C.muted,
  margin: "0 0 0.75rem",
};

export const small: CSSProperties = {
  fontSize: "0.9rem",
  color: C.muted,
};

export const link: CSSProperties = {
  color: C.ink,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

/** Muted back-link placed above page titles. */
export const backLink: CSSProperties = {
  display: "inline-block",
  marginBottom: "0.9rem",
  fontSize: "0.92rem",
  color: C.muted,
};

/** Button variants. `block` stretches full width. */
export function btn(
  variant: "primary" | "secondary" | "danger" | "ghost" = "primary",
  opts: { block?: boolean; small?: boolean } = {},
): CSSProperties {
  const base: CSSProperties = {
    display: "inline-block",
    padding: opts.small ? "0.3rem 0.65rem" : "0.55rem 1.1rem",
    fontSize: opts.small ? "0.85rem" : "0.95rem",
    fontWeight: variant === "ghost" ? 400 : 600,
    borderRadius: "8px",
    border: "1px solid transparent",
    cursor: "pointer",
    lineHeight: 1.3,
    boxSizing: "border-box",
    textDecoration: "none",
  };
  if (opts.block) base.width = "100%";
  switch (variant) {
    case "secondary":
      return { ...base, background: C.white, color: C.ink, borderColor: C.borderStrong };
    case "danger":
      return { ...base, background: C.white, color: C.danger, borderColor: C.dangerBorder };
    case "ghost":
      return { ...base, background: "transparent", color: C.muted, borderColor: "transparent" };
    default:
      return { ...base, background: C.ink, color: C.white, borderColor: C.ink };
  }
}

/** Text inputs / textareas (always fluid — 360px-safe by construction). */
export const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.55rem 0.7rem",
  fontSize: 16,
  fontFamily: "inherit",
  color: C.ink,
  background: C.white,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: "8px",
};

export const fieldLabel: CSSProperties = {
  display: "block",
  fontWeight: 600,
  fontSize: "0.92rem",
  marginBottom: "0.3rem",
};

export const hintText: CSSProperties = {
  ...small,
  margin: "0.3rem 0 0",
};

export const fieldStack: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

export const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.6rem",
};

export function stack(gap = "1rem"): CSSProperties {
  return { display: "flex", flexDirection: "column", gap };
}

/**
 * Overlay & interaction tokens (drawers, modals, toasts, busy states).
 * Deliberately plain numbers/strings so they work BOTH as inline-style values
 * AND as operands for JS breakpoint comparisons — inline styles cannot hold
 * media queries, so responsive overlays compare against these in JS.
 */

/** Stacking order for fixed overlays. Toasts always win. */
export const Z = { drawer: 40, modal: 50, toast: 60 } as const;

/** Standard animation durations, ready for `animation` shorthand values. */
export const DURATION = {
  fast: "120ms",
  base: "200ms",
  slow: "300ms",
} as const;

/** The app's standard easing curve for entrances/exits. */
export const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Standard control heights in px (icon buttons, inputs, list rows). */
export const CONTROL_HEIGHT = { sm: 32, md: 40, lg: 48 } as const;

/**
 * Layout breakpoints in px, as NUMBERS for JS comparisons, e.g.
 * `window.matchMedia(`(max-width: ${BP.sm - 1}px)`)` or
 * `window.innerWidth < BP.md`. Mirrors the usual 640 / 768 / 1024 scale.
 */
export const BP = { sm: 640, md: 768, lg: 1024 } as const;


/** Tinted status panel used by alerts across the app (incl. public forms). */
export function alertStyle(
  kind: "error" | "success" | "warning" | "info" = "info",
): CSSProperties {
  const palette = {
    error: { fg: C.danger, bg: C.dangerBg, border: C.dangerBorder },
    success: { fg: C.success, bg: C.successBg, border: C.successBorder },
    warning: { fg: C.warning, bg: C.warningBg, border: C.warningBorder },
    info: { fg: C.ink, bg: C.soft, border: C.border },
  }[kind];
  return {
    border: `1px solid ${palette.border}`,
    background: palette.bg,
    color: palette.fg,
    borderRadius: "8px",
    padding: "0.7rem 0.9rem",
    fontSize: "0.95rem",
    margin: "0.75rem 0",
  };
}
