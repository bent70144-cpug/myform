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
import { C, input, softCard } from "../../../lib/ui-tokens";

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
  boxSizing: "border-box" as const,
};

const titleStyle = {
  fontSize: "1.5rem",
  lineHeight: 1.25,
  margin: "0 0 16px",
};

const sectionStyle = {
  marginBottom: 16,
  borderTop: `1px solid ${C.border}`,
  paddingTop: 16,
};

const labelStyle = {
  display: "block",
  fontWeight: 600,
  marginBottom: 4,
};

const markStyle = {
  fontWeight: 400,
  fontSize: 13,
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
            case "welcome":
              return (
                <section key={block.id} style={{ marginBottom: 16 }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.15rem" }}>{block.title}</h2>
                  {block.description !== undefined ? (
                    <p style={{ margin: 0, color: C.muted }}>{block.description}</p>
                  ) : null}
                </section>
              );
            case "ending":
              return (
                <section key={block.id} style={{ marginBottom: 16 }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.15rem" }}>{block.title}</h2>
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
                <section key={block.id} style={sectionStyle}>
                  <label htmlFor={fieldId} style={labelStyle}>
                    {block.label}{" "}
                    <span style={markStyle}> ({mark})</span>
                  </label>
                  {block.description !== undefined ? (
                    <p style={{ margin: "0 0 6px", color: C.muted }}>{block.description}</p>
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
