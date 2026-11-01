/**
 * Explicit React namespace import: the web tsconfig uses `jsx: "preserve"`
 * (Next/SWC compiles it with the automatic runtime) while the vitest/esbuild
 * pipeline falls back to the classic transform; importing React keeps BOTH
 * compilers pointing at the same element factory without source pragmas
 * (Turbopack rejects `@jsx` when the automatic runtime is active).
 */
import * as React from "react";
import type { FormBlock } from "@form/contracts";
import { t } from "@form/i18n";
import { C, input, shadow, softCard } from "../../../lib/ui-tokens";

/**
 * Read-only public form view (ticket 09) — a presentational component with NO
 * next/navigation imports and NO data fetching, so tests can render it with
 * `react-dom/server` directly.
 *
 * Guarantees the spec pins on the public page:
 * - ALL creator text (titles, labels, descriptions, placeholders) renders as
 *   interpolated children — React's default escaping — never via
 *   dangerouslySetInnerHTML. A label containing `<script>` renders as text.
 * - NO session is created here (ticket 10 adds interactivity): questions
 *   render as DISABLED inputs, purely to show the form's shape.
 * - 360px-safe: the container is fluid (`width: 100%`, `max-width`), every
 *   input is `width: 100%` + `box-sizing: border-box` — no horizontal
 *   scrolling at narrow widths.
 *
 * M0 renders every block on ONE page: the card is a calm, single column —
 * hairline dividers between block sections, generous spacing around
 * questions, nothing fixed-width.
 */

/** Page wrapper: soft backdrop, centered single column. */
const pageStyle = {
  minHeight: "100vh",
  background: C.soft,
  padding: "2.5rem 1rem 3rem",
  boxSizing: "border-box" as const,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
};

/** The form card — fluid, 360px-safe (max-width never forces overflow). */
const containerStyle = {
  width: "100%",
  maxWidth: 640,
  margin: "0 auto",
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: "12px",
  padding: "24px",
  boxShadow: shadow.sm,
  boxSizing: "border-box" as const,
};

const titleStyle = {
  fontSize: "1.5rem",
  lineHeight: 1.25,
  letterSpacing: "-0.01em",
  margin: "0 0 20px",
};

/** The hairline rule every block section hangs under. */
const hairlineStyle = {
  borderTop: `1px solid ${C.border}`,
};

/** Welcome/ending narrative sections: hairline divider + moderate spacing. */
const narrativeStyle = {
  ...hairlineStyle,
  paddingTop: 16,
  marginBottom: 24,
};

/** Question sections: hairline divider + generous breathing room. */
const questionSectionStyle = {
  ...hairlineStyle,
  paddingTop: 20,
  marginBottom: 28,
};

const headingStyle = {
  margin: "0 0 6px",
  fontSize: "1.15rem",
};

const labelStyle = {
  display: "block",
  fontWeight: 600,
  marginBottom: 6,
};

const markStyle = {
  fontWeight: 400,
  fontSize: 13,
  color: C.muted,
};

const questionDescriptionStyle = {
  margin: "0 0 8px",
  color: C.muted,
};

export default function PublicFormView(props: {
  title: string;
  blocks: FormBlock[];
}) {
  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <h1 style={titleStyle}>
          {props.title.trim() || t("public.form.formTitleFallback")}
        </h1>
        {props.blocks.map((block) => {
          switch (block.kind) {
            // Welcome and ending are the same narrative shape: heading +
            // optional description, each opening with a hairline divider.
            case "welcome":
            case "ending":
              return (
                <section key={block.id} style={narrativeStyle}>
                  <h2 style={headingStyle}>{block.title}</h2>
                  {block.description !== undefined ? (
                    <p style={{ margin: 0, color: C.muted }}>{block.description}</p>
                  ) : null}
                </section>
              );
            case "short_text":
            case "long_text": {
              const mark = block.required
                ? t("public.form.requiredMark")
                : t("public.form.optionalMark");
              const fieldId = `f-${block.id}`;
              return (
                <section key={block.id} style={questionSectionStyle}>
                  <label htmlFor={fieldId} style={labelStyle}>
                    {block.label}{" "}
                    <span style={markStyle}> ({mark})</span>
                  </label>
                  {block.description !== undefined ? (
                    <p style={questionDescriptionStyle}>{block.description}</p>
                  ) : null}
                  {block.kind === "long_text" ? (
                    <textarea
                      id={fieldId}
                      rows={4}
                      disabled
                      placeholder={block.placeholder}
                      style={input}
                    />
                  ) : (
                    <input
                      id={fieldId}
                      type="text"
                      disabled
                      placeholder={block.placeholder}
                      style={input}
                    />
                  )}
                </section>
              );
            }
          }
        })}
      </div>
    </main>
  );
}

/** The closed message (unpublished or soft-deleted form) — same no-store page. */
export function PublicFormClosed() {
  return (
    <main style={pageStyle}>
      <div style={{ ...containerStyle, textAlign: "center" }}>
        <h1 style={titleStyle}>{t("public.form.closedTitle")}</h1>
        <p style={{ ...softCard, margin: 0 }}>{t("public.form.closedDetail")}</p>
      </div>
    </main>
  );
}
