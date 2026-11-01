/**
 * Shared UI kit for the web app (server- AND client-component safe: no hooks,
 * no event wiring, no "use client").
 *
 * The app deliberately has NO CSS framework (spec visual language): every
 * component styles itself through inline styles, and THIS module owns the
 * tokens so the visual language stays coherent across every page — slate ink
 * on white, hairline borders, soft gray surfaces (system-ui throughout).
 *
 * JSX compile note (same as PublicFormView/PublicFormClient): the web
 * tsconfig uses `jsx: "preserve"` (Next/SWC → automatic runtime) while the
 * vitest/esbuild pipeline falls back to the classic transform — the explicit
 * `import * as React` keeps BOTH compilers pointing at the same element
 * factory. CAUTION: never write the JSX-pragma marker verbatim in a comment.
 */
import * as React from "react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { t } from "@form/i18n";

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
} as const;

const RADIUS = "10px";
const SHADOW = "0 1px 2px rgba(15, 23, 42, 0.05)";

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
  boxShadow: SHADOW,
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

/** Status alert. Error alerts announce themselves; successes use role=status. */
export function Alert(props: {
  kind?: "error" | "success" | "warning" | "info";
  children: ReactNode;
}) {
  const kind = props.kind ?? "info";
  const palette = {
    error: { fg: C.danger, bg: C.dangerBg, border: C.dangerBorder, role: "alert" },
    success: { fg: C.success, bg: C.successBg, border: C.successBorder, role: "status" },
    warning: { fg: C.warning, bg: C.warningBg, border: C.warningBorder, role: "alert" },
    info: { fg: C.ink, bg: C.infoBg, border: C.border, role: "note" },
  }[kind];
  return (
    <div
      role={palette.role}
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        borderRadius: "8px",
        padding: "0.7rem 0.9rem",
        fontSize: "0.95rem",
        margin: "0.75rem 0",
      }}
    >
      {props.children}
    </div>
  );
}

/** Small pill (status, version, block kind). */
export function Badge(props: {
  kind?: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const kind = props.kind ?? "neutral";
  const palette = {
    neutral: { fg: C.muted, bg: C.soft, border: C.border },
    success: { fg: C.success, bg: C.successBg, border: C.successBorder },
    warning: { fg: C.warning, bg: C.warningBg, border: C.warningBorder },
    danger: { fg: C.danger, bg: C.dangerBg, border: C.dangerBorder },
  }[kind];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.6rem",
        borderRadius: 999,
        fontSize: "0.8rem",
        fontWeight: 600,
        lineHeight: 1.5,
        color: palette.fg,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </span>
  );
}

/** Label + control + optional hint, stacked. */
export function Field(props: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={props.htmlFor} style={fieldLabel}>
        {props.label}
      </label>
      {props.children}
      {props.hint !== undefined ? <p style={hintText}>{props.hint}</p> : null}
    </div>
  );
}

/** Pulsing dot for in-progress states (keyframes live in the root layout). */
export function PulseDot() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 999,
        background: C.muted,
        marginRight: 6,
        animation: "uiPulse 1.2s ease-in-out infinite",
        verticalAlign: "middle",
      }}
    />
  );
}

/** Empty/quiet state panel. */
export function EmptyState(props: { children: ReactNode }) {
  return (
    <div
      style={{
        ...softCard,
        textAlign: "center",
        padding: "2rem 1.25rem",
        color: C.muted,
      }}
    >
      {props.children}
    </div>
  );
}

/** Top app bar: brand on the left, actions on the right. */
export function AppNav(props: { children?: ReactNode }) {
  return (
    <header
      style={{
        borderBottom: `1px solid ${C.border}`,
        background: C.white,
      }}
    >
      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "0.75rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.6rem",
        }}
      >
        <Link href="/" style={{ fontWeight: 700, fontSize: "1.05rem", color: C.ink, textDecoration: "none" }}>
          {t("common.appName")}
        </Link>
        {props.children !== undefined ? <nav style={row}>{props.children}</nav> : null}
      </div>
    </header>
  );
}

/** Centered auth shell: brand bar + card with title. */
export function AuthShell(props: { title: string; children: ReactNode; width?: number }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: C.soft,
      }}
    >
      <div style={{ padding: "1.25rem", textAlign: "center" }}>
        <Link href="/" style={{ fontWeight: 700, fontSize: "1.15rem", color: C.ink, textDecoration: "none" }}>
          {t("common.appName")}
        </Link>
      </div>
      <main style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "1rem 1.25rem 3rem" }}>
        <div style={{ width: "100%", maxWidth: props.width ?? 400 }}>
          <div style={card}>
            <h1 style={{ ...h1, fontSize: "1.35rem" }}>{props.title}</h1>
            {props.children}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Divider line between stacked sections. */
export function Divider() {
  return <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "1.25rem 0" }} />;
}
