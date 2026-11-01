/**
 * Shared UI kit COMPONENTS (server- AND client-component safe: no hooks, no
 * event wiring). Pure style tokens live in ./ui-tokens and are re-exported
 * here so `lib/ui` stays the single import for most pages. The public-form
 * files import ./ui-tokens directly (they are rendered by tests that must
 * not pull in next/link).
 *
 * The app deliberately has NO CSS framework (spec visual language): every
 * component styles itself through inline styles.
 */
import * as React from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@form/i18n";
import { alertStyle, C, card, fieldLabel, h1, hintText, row, softCard } from "./ui-tokens";

export * from "./ui-tokens";

/** Status alert. Error alerts announce themselves; successes use role=status. */
export function Alert(props: {
  kind?: "error" | "success" | "warning" | "info";
  /** Overrides the kind's default live-region role. */
  role?: "alert" | "status" | "note";
  children: ReactNode;
}) {
  const kind = props.kind ?? "info";
  const palette = {
    error: { fg: C.danger, bg: C.dangerBg, border: C.dangerBorder, role: "alert" },
    success: { fg: C.success, bg: C.successBg, border: C.successBorder, role: "status" },
    warning: { fg: C.warning, bg: C.warningBg, border: C.warningBorder, role: "alert" },
    info: { fg: C.ink, bg: C.infoBg, border: C.border, role: "note" },
  }[kind];
  const role = props.role ?? palette.role;
  return (
    <div
      role={role}
      style={alertStyle(kind)}
    >
      {props.children}
    </div>
  );
}

/** Small pill (status, version, block kind). */
export function Badge(
  props: {
    kind?: "neutral" | "success" | "warning" | "danger";
    children: ReactNode;
  } & React.HTMLAttributes<HTMLSpanElement>,
) {
  const kind = props.kind ?? "neutral";
  const rest = { ...props };
  delete rest.kind;
  delete rest.children;
  const palette = {
    neutral: { fg: C.muted, bg: C.soft, border: C.border },
    success: { fg: C.success, bg: C.successBg, border: C.successBorder },
    warning: { fg: C.warning, bg: C.warningBg, border: C.warningBorder },
    danger: { fg: C.danger, bg: C.dangerBg, border: C.dangerBorder },
  }[kind];
  return (
    <span
      {...rest}
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
