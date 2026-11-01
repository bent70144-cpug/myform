/**
 * JSX compile note: the web tsconfig uses `jsx: "preserve"`, so Next/SWC
 * compiles this file with the automatic runtime (no React import needed for
 * JSX itself), while the vitest/esbuild pipeline falls back to the classic
 * transform — the explicit `import * as React` below satisfies BOTH.
 * CAUTION: never write the JSX-pragma marker (at-sign + jsx) verbatim in a
 * comment here — esbuild scans comments for that marker and treats the
 * following word as the JSX factory (Turbopack likewise rejects pragmas
 * under the automatic runtime, and the marker silently breaks vitest).
 */
"use client";
import * as React from "react";
import type { FormBlock, FormDraftSchema } from "@form/contracts";
import { t } from "@form/i18n";
import {
  createPublicSession,
  sessionTokenStorageKey,
  submitPublicAnswers,
} from "./public-session-client";
import {
  blankRequiredBlocks,
  endingBlock,
  mapFieldErrors,
  phaseForSubmitProblem,
  welcomeBlock,
  type PublicFormPhase,
} from "./public-form-machine";
import {
  alertStyle,
  btn,
  C,
  DURATION,
  EASE,
  input,
  shadow,
} from "../../../lib/ui-tokens";

/**
 * The INTERACTIVE public form (ticket 10) — makes T09's read-only /f/[slug]
 * page collect answers and submit them.
 *
 * Lifecycle (spec "Public form and submission lifecycle"):
 * - a pinned session is created ON THE MOUNT (single-page flow) via the
 *   cookie-less, origin-exempt `POST /v1/public/forms/{slug}/sessions`; the
 *   raw token lives in sessionStorage and is sent as `X-Form-Session`;
 * - questions render from the PINNED schema with programmatically associated
 *   labels (htmlFor/id) and error messages (aria-describedby);
 * - required-check is a client-side CONVENIENCE — the server re-validates
 *   against the pinned schema and its stable codes drive the field errors;
 * - a receipt swaps the form for the ending block; closed/expired failures
 *   show the closed / restart messages instead.
 *
 * M0 keeps ALL questions on ONE page (no fake one-question-per-screen): a
 * slim progress module above the questions reports how many are answered.
 *
 * 360px safety: the container and every input are fluid (`width: 100%`,
 * `box-sizing: border-box`), stacked in a single column — no fixed widths
 * anywhere, so there is no horizontal scrolling at narrow viewports.
 */

/** Page wrapper: soft backdrop, centered single column (matches T09 view). */
const pageStyle = {
  minHeight: "100vh",
  background: C.soft,
  padding: "2.5rem 1rem 3rem",
  boxSizing: "border-box" as const,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
};

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

const errorStyle = {
  ...alertStyle("error"),
  width: "100%",
  boxSizing: "border-box" as const,
};

const stackStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
  width: "100%",
};

const sectionStyle = {
  borderTop: `1px solid ${C.border}`,
  paddingTop: 20,
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

/** Welcome section: hairline divider under the page title (matches T09 view). */
const welcomeSectionStyle = {
  borderTop: `1px solid ${C.border}`,
  paddingTop: 16,
};

const headingStyle = {
  margin: "0 0 6px",
  fontSize: "1.15rem",
};

/**
 * Progress module — pure inline styles, fluid end to end: a thin track
 * (4px, pill-shaped, full width) with an ink fill whose width is the
 * answered percentage, plus a muted caption underneath. The percent string
 * is a layout value, not an input width, so 360px safety is untouched.
 */
const progressModuleStyle = {
  width: "100%",
};

const progressTrackStyle = {
  height: 4,
  width: "100%",
  borderRadius: 999,
  background: C.border,
  overflow: "hidden" as const,
};

const progressFillStyle = (percent: number) => ({
  height: "100%",
  width: `${percent}%`,
  borderRadius: 999,
  background: C.ink,
  transition: `width ${DURATION.base} ${EASE}`,
});

const progressCaptionStyle = {
  margin: "6px 0 0",
  fontSize: 13,
  color: C.muted,
};

export default function PublicFormClient(props: { slug: string; schema: FormDraftSchema }) {
  const blocks = props.schema.blocks;
  const [phase, setPhase] = React.useState<PublicFormPhase>("form");
  const [sessionState, setSessionState] = React.useState<"starting" | "active" | "failed">("starting");
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [showFixErrors, setShowFixErrors] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Session creation on mount. The raw token is returned ONCE — keep it in
  // sessionStorage keyed by slug (survives an accidental reload within the
  // tab; the server treats a second submit of a completed session as the
  // idempotent-receipt path).
  React.useEffect(() => {
    let cancelled = false;
    const stored = typeof window !== "undefined"
      ? window.sessionStorage.getItem(sessionTokenStorageKey(props.slug))
      : null;
    if (stored !== null) {
      tokenRef.current = stored;
      setSessionState("active");
      return;
    }
    void createPublicSession(props.slug).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        tokenRef.current = result.session.token;
        try {
          window.sessionStorage.setItem(
            sessionTokenStorageKey(props.slug),
            result.session.token,
          );
        } catch {
          // sessionStorage unavailable (private mode) — tokenRef above keeps
          // the in-memory flow working for this mount.
        }
        setSessionState("active");
      } else {
        setSessionState("failed");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.slug]);

  // Keep the token reachable for submits even when storage is unavailable.
  const tokenRef = React.useRef<string | null>(null);

  const readToken = (): string | null => {
    if (tokenRef.current !== null) return tokenRef.current;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(sessionTokenStorageKey(props.slug));
  };

  const setAnswer = (blockId: string, value: string): void => {
    setAnswers((prev) => ({ ...prev, [blockId]: value }));
    setFieldErrors((prev) => {
      if (prev[blockId] === undefined) return prev;
      const next = { ...prev };
      delete next[blockId];
      return next;
    });
    setShowFixErrors(false);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting || phase !== "form") return;

    const blank = blankRequiredBlocks(blocks, answers);
    if (blank.length > 0) {
      const errors: Record<string, string> = {};
      for (const id of blank) errors[id] = "required_answer_missing";
      setFieldErrors(errors);
      setShowFixErrors(true);
      return;
    }

    const token = readToken();
    if (token === null) {
      setSessionState("failed");
      return;
    }
    setSubmitting(true);
    setShowFixErrors(false);
    try {
      const result = await submitPublicAnswers(token, answers);
      if (result.ok) {
        // One receipt per session — drop the token so a reload restarts
        // cleanly instead of resubmitting.
        try {
          window.sessionStorage.removeItem(sessionTokenStorageKey(props.slug));
        } catch {
          // ignore storage failures
        }
        tokenRef.current = null;
        setPhase("ended");
        return;
      }
      const nextPhase = phaseForSubmitProblem(result.problem, result.status);
      setPhase(nextPhase);
      if (nextPhase === "form" && result.problem) {
        setFieldErrors(mapFieldErrors(result.problem));
        setShowFixErrors(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const welcome = welcomeBlock(blocks);
  const ending = endingBlock(blocks);
  const title = props.schema.title.trim() || t("public.form.formTitleFallback");

  const questionBlocks = blocks.filter(
    (b): b is Extract<FormBlock, { kind: "short_text" | "long_text" }> =>
      b.kind === "short_text" || b.kind === "long_text",
  );

  // Progress accounting for the module above the questions. Whitespace-only
  // answers do not count, mirroring blankRequiredBlocks' rule. Guarded by the
  // total > 0 check at the render site, so the division is always safe.
  const totalQuestions = questionBlocks.length;
  const answeredQuestions = questionBlocks.filter(
    (b) => (answers[b.id] ?? "").trim().length > 0,
  ).length;

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <h1 style={titleStyle}>{title}</h1>
        {phase === "ended" ? (
          <section data-testid="public-form-ended" style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: "1.5rem", lineHeight: 1.25 }}>
              {ending !== null && ending.title.trim() !== "" ? ending.title : t("public.form.endingTitleFallback")}
            </h2>
            {ending?.description !== undefined ? (
              <p style={{ margin: "0 0 8px", color: C.muted }}>{ending.description}</p>
            ) : null}
            <p role="status" style={{ ...alertStyle("success"), margin: "12px 0 0" }}>
              {t("public.form.submittedDetail")}
            </p>
          </section>
        ) : phase === "closed" ? (
          <section data-testid="public-form-closed">
            <p role="alert" style={errorStyle}>{t("public.form.formClosedInline")}</p>
          </section>
        ) : phase === "expired" ? (
          <section data-testid="public-form-expired">
            <p role="alert" style={errorStyle}>{t("public.form.sessionExpiredInline")}</p>
          </section>
        ) : phase === "error" ? (
          <section data-testid="public-form-error">
            <p role="alert" style={errorStyle}>{t("public.form.submitFailed")}</p>
          </section>
        ) : sessionState === "failed" ? (
          <section data-testid="public-form-session-failed">
            <p role="alert" style={errorStyle}>{t("public.form.sessionStartFailed")}</p>
          </section>
        ) : (
          <form onSubmit={(event) => void onSubmit(event)} style={stackStyle} noValidate>
            {welcome !== null ? (
              <section style={welcomeSectionStyle}>
                <h2 style={headingStyle}>{welcome.title}</h2>
                {welcome.description !== undefined ? (
                  <p style={{ margin: 0, color: C.muted }}>{welcome.description}</p>
                ) : null}
              </section>
            ) : null}

            {showFixErrors ? (
              <p role="alert" style={{ ...errorStyle, margin: 0 }}>
                {t("public.form.fixErrorsDetail")}
              </p>
            ) : null}

            {sessionState === "starting" ? (
              <p style={{ color: C.muted, margin: 0 }} role="status">
                {t("public.form.sessionStarting")}
              </p>
            ) : null}

            {totalQuestions > 0 ? (
              <div style={progressModuleStyle}>
                <div
                  role="progressbar"
                  aria-label={t("public.form.progressLabel")}
                  aria-valuemin={0}
                  aria-valuemax={totalQuestions}
                  aria-valuenow={answeredQuestions}
                  style={progressTrackStyle}
                >
                  <div
                    style={progressFillStyle(
                      Math.round((answeredQuestions / totalQuestions) * 100),
                    )}
                  />
                </div>
                <p style={progressCaptionStyle}>
                  {t("public.form.answeredOf", {
                    answered: answeredQuestions,
                    total: totalQuestions,
                  })}
                </p>
              </div>
            ) : null}

            {questionBlocks.map((block) => {
              const mark = block.required
                ? t("public.form.requiredMark")
                : t("public.form.optionalMark");
              const fieldId = `f-${block.id}`;
              const errorId = `f-${block.id}-error`;
              const error = fieldErrors[block.id];
              return (
                <section key={block.id} style={sectionStyle}>
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
                      name={block.id}
                      rows={4}
                      value={answers[block.id] ?? ""}
                      placeholder={block.placeholder}
                      aria-invalid={error !== undefined ? true : undefined}
                      aria-describedby={error !== undefined ? errorId : undefined}
                      onChange={(e) => setAnswer(block.id, e.target.value)}
                      style={input}
                    />
                  ) : (
                    <input
                      id={fieldId}
                      name={block.id}
                      type="text"
                      value={answers[block.id] ?? ""}
                      placeholder={block.placeholder}
                      aria-invalid={error !== undefined ? true : undefined}
                      aria-describedby={error !== undefined ? errorId : undefined}
                      onChange={(e) => setAnswer(block.id, e.target.value)}
                      style={input}
                    />
                  )}
                  {error !== undefined ? (
                    <p id={errorId} role="alert" style={{ ...errorStyle, margin: "4px 0 0" }}>
                      {t(`errors.schemaIssues.${error}` as never)}
                    </p>
                  ) : null}
                </section>
              );
            })}

            <button
              type="submit"
              disabled={submitting || sessionState !== "active"}
              style={btn("primary", { block: true })}
            >
              {submitting ? t("public.form.submittingButton") : t("public.form.submitButton")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
