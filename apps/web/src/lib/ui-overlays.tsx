"use client";

/**
 * Overlay & interactive primitives for the design system: Modal (bottom sheet
 * on phones, centered dialog on desktop), the toast manager, Skeleton, Tabs
 * and ConfirmDialog. Dependency-free by construction — inline styles plus the
 * shared tokens in ./ui-tokens, no portals, no new packages.
 *
 * Like every JSX module in this app, this file imports the React namespace
 * explicitly: the web tsconfig keeps `jsx: "preserve"` (Next's automatic
 * runtime) while the vitest/esbuild pipeline falls back to the classic
 * transform; importing React keeps BOTH compilers on the same element factory
 * without source pragma markers (Turbopack rejects those when the automatic
 * runtime is active).
 *
 * Strings: user-visible copy is NEVER hardcoded here. Labels arrive via props
 * and callers MUST pass catalog strings from @form/i18n. The only t() lookups
 * are the three keys this slice is allowed to use — errors.internal.retry
 * (confirm default), common.backHome (cancel default) and common.loading
 * (busy state). Icon-only buttons (×) take their accessible name from the
 * `closeLabel` / `dismissLabel` props; nothing is invented for them.
 */

import * as React from "react";
import type { CSSProperties, ReactNode } from "react";
import { t } from "@form/i18n";
import { BP, btn, C, CONTROL_HEIGHT, DURATION, EASE, shadow, Z } from "./ui-tokens";

/**
 * Match a "max-width" breakpoint in JS (inline styles cannot hold media
 * queries). Starts `false` so server and first client render agree, then
 * syncs on mount and follows changes.
 */
function useMaxWidth(px: number): boolean {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia(`(max-width: ${px - 1}px)`)
        : null;
    if (!mql) {
      setMatches(window.innerWidth < px);
      return;
    }
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [px]);
  return matches;
}

/**
 * Keyframes + reduced-motion guard for overlays. Inline styles cannot express
 * @keyframes or @media, so this tiny scoped sheet rides along with the Modal.
 * Duplicates across simultaneously mounted overlays are identical and benign;
 * the `ui-overlay-anim` class opts animated elements into the guard.
 */
const OVERLAY_CSS = `
@keyframes uiOverlayFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes uiOverlaySlideUp { from { transform: translateY(28px); opacity: 0.5; } to { transform: translateY(0); opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .ui-overlay-anim { animation: none !important; }
}
`;

/** Focusable elements for the basic focus trap (kept shallow on purpose). */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Modal dialog: a portal-free fixed overlay. Renders `null` when closed.
 * Backdrop click and Escape close it; on open the panel is focused and body
 * scroll is locked (scrollbar gap compensated); on close the previously
 * focused element is restored. Under 640px it becomes a full-width bottom
 * sheet (slide-up, rounded top corners); on desktop a centered dialog.
 */
export function Modal(props: {
  open: boolean;
  onClose: () => void;
  /** Heading AND accessible name of the dialog. Callers pass a catalog string. */
  title: string;
  children: ReactNode;
  /** Max panel width on desktop, in px. Mobile sheets ignore it. Default 520. */
  width?: number;
  /**
   * Accessible name for the × button. Callers MUST pass a catalog string
   * (requested key: common.close) — this component invents none.
   */
  closeLabel?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  // Latest-ref pattern: the open/close effect must not restart (and re-steal
  // focus) just because the caller passed a new inline onClose.
  const onCloseRef = React.useRef(props.onClose);
  onCloseRef.current = props.onClose;
  const narrow = useMaxWidth(BP.sm);

  React.useEffect(() => {
    if (!props.open) return;
    const previous = document.activeElement;
    const { overflow, paddingRight } = document.body.style;
    // Lock body scroll, compensating for the vanished scrollbar's width.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0] ?? null;
      const last = focusables[focusables.length - 1] ?? null;
      const active = document.activeElement;
      if (event.shiftKey) {
        if ((active === first || active === panel) && last) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last && first) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [props.open]);

  if (!props.open) return null;

  const panelStyle: CSSProperties = {
    background: C.white,
    border: `1px solid ${C.border}`,
    boxShadow: shadow.lg,
    boxSizing: "border-box",
    width: "100%",
    maxHeight: "min(640px, 85dvh)",
    overflowY: "auto",
    padding: "1.25rem",
    ...(narrow
      ? {
          maxWidth: "100%",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          animation: `uiOverlaySlideUp ${DURATION.base} ${EASE}`,
        }
      : {
          maxWidth: props.width ?? 520,
          animation: `uiOverlayFadeIn ${DURATION.fast} ease-out`,
        }),
    borderRadius: narrow ? "12px 12px 0 0" : "10px",
  };

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.modal,
        background: C.overlay,
        display: "flex",
        alignItems: narrow ? "flex-end" : "center",
        justifyContent: "center",
        padding: narrow ? 0 : "1.5rem 1rem",
        animation: `uiOverlayFadeIn ${DURATION.fast} ease-out`,
      }}
    >
      <style>{OVERLAY_CSS}</style>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabIndex={-1}
        className="ui-overlay-anim"
        style={panelStyle}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.6rem",
            marginBottom: "0.9rem",
          }}
        >
          <h2 style={{ fontSize: "1.15rem", lineHeight: 1.3, fontWeight: 700, margin: 0 }}>
            {props.title}
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label={props.closeLabel}
            style={{
              flex: "0 0 auto",
              display: "grid",
              placeItems: "center",
              width: CONTROL_HEIGHT.sm,
              height: CONTROL_HEIGHT.sm,
              padding: 0,
              fontSize: "1.2rem",
              lineHeight: 1,
              color: C.muted,
              background: "transparent",
              border: "1px solid transparent",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder block (decorative, aria-hidden). Shimmers via the
 * GLOBAL `uiPulse` opacity keyframes already shipped by the root layout —
 * no new keyframes are introduced. Reduced motion is neutralized by the tiny
 * scoped sheet below (inline styles cannot hold media queries).
 */
const SKELETON_CSS = `
@media (prefers-reduced-motion: reduce) {
  .ui-skeleton { animation: none !important; }
}
`;

export function Skeleton(props: {
  /** CSS width (px number or any CSS width string). Default "100%". */
  w?: number | string;
  /** CSS height (one text line by default). */
  h?: number | string;
  /** Corner radius. Default 6. */
  radius?: number | string;
}) {
  return (
    <>
      <style>{SKELETON_CSS}</style>
      <div
        aria-hidden="true"
        className="ui-skeleton"
        style={{
          width: props.w ?? "100%",
          height: props.h ?? "0.9rem",
          borderRadius: props.radius ?? 6,
          background: C.border,
          animation: "uiPulse 1.4s ease-in-out infinite",
        }}
      />
    </>
  );
}

export type ToastKind = "success" | "error" | "info";

type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  toasts: ToastItem[];
  push: (toast: { kind: ToastKind; message: string }) => void;
  dismiss: (id: number) => void;
  dismissLabel?: string;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;
const TOAST_MAX_VISIBLE = 4;

const TOAST_PALETTE: Record<
  ToastKind,
  { fg: string; border: string; role: "alert" | "status" }
> = {
  success: { fg: C.success, border: C.successBorder, role: "status" },
  info: { fg: C.ink, border: C.border, role: "status" },
  error: { fg: C.danger, border: C.dangerBorder, role: "alert" },
};

/**
 * Toast context provider. Mount it once around an interactive tree; it
 * renders the stacked viewport itself (bottom-right, bottom-center on
 * mobile). Messages come from callers — pass catalog strings, never literals.
 */
export function ToastProvider(props: {
  children?: ReactNode;
  /**
   * Accessible name for each toast's × button. Callers MUST pass a catalog
   * string (requested key: common.dismiss).
   */
  dismissLabel?: string;
}) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const push = React.useCallback((toast: { kind: ToastKind; message: string }) => {
    nextId.current += 1;
    const item: ToastItem = {
      id: nextId.current,
      kind: toast.kind,
      message: toast.message,
    };
    setToasts((list) => [...list, item].slice(-TOAST_MAX_VISIBLE));
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({ toasts, push, dismiss, dismissLabel: props.dismissLabel }),
    [toasts, push, dismiss, props.dismissLabel],
  );

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

/** Push toasts from any component under a ToastProvider. */
export function useToast(): {
  push: (toast: { kind: ToastKind; message: string }) => void;
} {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return { push: ctx.push };
}

/**
 * The stacked toast viewport. Rendered automatically by ToastProvider;
 * exported for custom mounting — render it at most once. Renders null when
 * empty or used outside a provider.
 */
export function ToastViewport() {
  const ctx = React.useContext(ToastContext);
  const narrow = useMaxWidth(BP.sm);
  if (!ctx || ctx.toasts.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        zIndex: Z.toast,
        bottom: "1rem",
        right: "1rem",
        left: narrow ? "1rem" : "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: narrow ? "stretch" : "flex-end",
        gap: "0.5rem",
        pointerEvents: "none",
      }}
    >
      {ctx.toasts.map((toast) => (
        <ToastRow
          key={toast.id}
          toast={toast}
          dismiss={ctx.dismiss}
          dismissLabel={ctx.dismissLabel}
        />
      ))}
    </div>
  );
}

function ToastRow(props: {
  toast: ToastItem;
  dismiss: (id: number) => void;
  dismissLabel?: string;
}) {
  const { toast, dismiss } = props;
  const palette = TOAST_PALETTE[toast.kind];
  React.useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.id]);
  return (
    <div
      role={palette.role}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.6rem",
        width: "min(360px, 100%)",
        boxSizing: "border-box",
        background: C.white,
        border: `1px solid ${palette.border}`,
        borderLeft: `3px solid ${palette.fg}`,
        borderRadius: "8px",
        padding: "0.55rem 0.7rem",
        boxShadow: shadow.md,
        color: C.ink,
        fontSize: "0.9rem",
        lineHeight: 1.45,
      }}
    >
      <span style={{ flex: 1, overflowWrap: "break-word" }}>{toast.message}</span>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label={props.dismissLabel}
        style={{
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
          width: 24,
          height: 24,
          padding: 0,
          margin: "-2px -4px 0 0",
          fontSize: "1rem",
          lineHeight: 1,
          color: C.muted,
          background: "transparent",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * Underline tab strip with roving tabindex and arrow/Home/End navigation
 * (selection follows focus). Labels come from callers — pass catalog strings.
 */
export function Tabs(props: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. Callers pass a catalog string. */
  ariaLabel?: string;
}) {
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown =
    (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const count = props.tabs.length;
      if (count === 0) return;
      let next: number;
      if (event.key === "ArrowRight") next = (index + 1) % count;
      else if (event.key === "ArrowLeft") next = (index - 1 + count) % count;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = count - 1;
      else return;
      event.preventDefault();
      const target = props.tabs[next];
      const button = tabRefs.current[next];
      if (!target || !button) return;
      button.focus();
      props.onChange(target.id);
    };

  return (
    <div
      role="tablist"
      aria-label={props.ariaLabel}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      {props.tabs.map((tab, index) => {
        const selected = tab.id === props.active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => props.onChange(tab.id)}
            onKeyDown={onKeyDown(index)}
            style={{
              appearance: "none",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${selected ? C.ink : "transparent"}`,
              color: selected ? C.ink : C.muted,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.92rem",
              fontWeight: selected ? 600 : 400,
              padding: "0.5rem 0.75rem",
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Thin ConfirmDialog over Modal: a body plus cancel/confirm buttons. The
 * confirm button is primary (or the app's danger button for destructive
 * actions); defaults come from the catalog — errors.internal.retry for
 * confirm, common.backHome for cancel — and callers SHOULD pass more fitting
 * catalog strings via `confirmLabel` / `cancelLabel` when available. It does
 * not close itself: flip `open` in `onClose` / `onConfirm`. While `busy`,
 * both buttons disable, the confirm button shows the loading string, and
 * Escape/backdrop/× close attempts are ignored.
 */
export function ConfirmDialog(props: {
  open: boolean;
  onClose: () => void;
  /** Dialog heading + accessible name. Callers pass a catalog string. */
  title: string;
  children?: ReactNode;
  /** Confirm button label. Default: t("errors.internal.retry"). */
  confirmLabel?: string;
  /** Cancel button label. Default: t("common.backHome"). */
  cancelLabel?: string;
  onConfirm?: () => void;
  /** Danger styling on the confirm button (destructive actions). */
  danger?: boolean;
  /** Disables both buttons and shows the loading label on confirm. */
  busy?: boolean;
  /** Desktop panel width (px), forwarded to Modal. */
  width?: number;
  /** Accessible name for the × button, forwarded to Modal. */
  closeLabel?: string;
}) {
  const confirmLabel = props.confirmLabel ?? t("errors.internal.retry");
  const cancelLabel = props.cancelLabel ?? t("common.backHome");
  const guardedClose = () => {
    if (!props.busy) props.onClose();
  };
  return (
    <Modal
      open={props.open}
      onClose={guardedClose}
      title={props.title}
      width={props.width}
      closeLabel={props.closeLabel}
    >
      {props.children}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          gap: "0.6rem",
          marginTop: "1.1rem",
        }}
      >
        <button
          type="button"
          onClick={guardedClose}
          disabled={props.busy}
          style={{ ...btn("secondary"), opacity: props.busy ? 0.6 : undefined }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!props.busy) props.onConfirm?.();
          }}
          disabled={props.busy}
          style={{
            ...btn(props.danger === true ? "danger" : "primary"),
            opacity: props.busy ? 0.6 : undefined,
          }}
        >
          {props.busy ? t("common.loading") : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
