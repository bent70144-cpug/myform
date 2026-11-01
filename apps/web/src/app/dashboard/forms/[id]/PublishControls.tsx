"use client";

import { useState } from "react";
import { t } from "@form/i18n";
import {
  buildPublicUrl,
  bytesAsKb,
  publishForm,
  publishIssueMessage,
  unpublishForm,
  worstCaseExceedsCap,
  type PublishIssue,
} from "../../../../lib/publish";
import { Alert, Badge, btn, card, C, row } from "../../../../lib/ui";

/**
 * Publish controls (ticket 09) — the dashboard's status line,
 * Publish / Republish / Unpublish buttons, copy-link action and the
 * publish-time worst-case warning.
 *
 * Mutations are browser POSTs through the same-origin /v1/* rewrite
 * (lib/publish.ts — never the internal API URL; the Origin guard requires the
 * browser's Origin on state changes). The form's status arrives from the
 * server render (GET /v1/forms/{id}) and is then tracked client-side so the
 * buttons reflect the outcome of each action WITHOUT a reload:
 *
 *   draft     → Publish (creates immutable version 1 + allocates the slug)
 *   published → Republish (new immutable version, same slug) + Unpublish
 *   closed    → closed note + Republish (reopens with a NEW version)
 *
 * The slug and version number come from the publish RESPONSE (the form
 * detail contract does not carry them) and live in client state — so the
 * copy-link appears immediately after publishing, and stays for
 * unpublish→closed (the same URL then serves the closed page).
 *
 * A 422 publish-validation failure renders the stable engine codes as
 * readable messages via the shared `errors.schemaIssues` catalog (with a
 * generic fallback for codes this catalog does not know). When the response's
 * worst-case answer size exceeds the submission cap, a persistent warning
 * line is shown (the numbers come from the publish response).
 */

type FormStatus = "draft" | "published" | "closed";
type Phase = "idle" | "publishing" | "unpublishing";

const STATUS_KEY = {
  draft: "dashboard.publish.status.draft",
  published: "dashboard.publish.status.published",
  closed: "dashboard.publish.status.closed",
} as const;

const STATUS_BADGE = {
  draft: "neutral",
  published: "success",
  closed: "warning",
} as const;

export default function PublishControls(props: {
  formId: string;
  status: FormStatus;
  /** Public origin for {APP_ORIGIN}/f/{slug} (server-derived; "" hides it). */
  appOrigin: string;
}) {
  const [status, setStatus] = useState<FormStatus>(props.status);
  const [phase, setPhase] = useState<Phase>("idle");
  const [slug, setSlug] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [sizes, setSizes] = useState<{
    worstCaseBytes: number;
    submissionCapBytes: number;
  } | null>(null);
  const [issues, setIssues] = useState<PublishIssue[] | null>(null);
  const [failed, setFailed] = useState<null | "publish" | "unpublish">(null);
  const [copied, setCopied] = useState(false);

  const busy = phase !== "idle";

  async function onPublish() {
    setPhase("publishing");
    setIssues(null);
    setFailed(null);
    setCopied(false);
    const result = await publishForm(props.formId);
    if (result.kind === "published") {
      setStatus("published");
      setSlug(result.response.slug);
      setVersionNumber(result.response.versionNumber);
      setSizes({
        worstCaseBytes: result.response.worstCaseBytes,
        submissionCapBytes: result.response.submissionCapBytes,
      });
    } else if (result.kind === "validation") {
      setIssues(result.issues);
    } else {
      setFailed("publish");
    }
    setPhase("idle");
  }

  async function onUnpublish() {
    setPhase("unpublishing");
    setIssues(null);
    setFailed(null);
    setCopied(false);
    const ok = await unpublishForm(props.formId);
    if (ok) {
      setStatus("closed");
      // The slug stays: /f/{slug} now serves the closed page.
    } else {
      setFailed("unpublish");
    }
    setPhase("idle");
  }

  async function onCopy() {
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(buildPublicUrl(props.appOrigin, slug));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context): the URL is
      // rendered as text right next to the button, so nothing is lost.
    }
  }

  const publishLabel =
    status === "draft"
      ? phase === "publishing"
        ? t("dashboard.publish.publishing")
        : t("dashboard.publish.publish")
      : phase === "publishing"
        ? t("dashboard.publish.republishing")
        : t("dashboard.publish.republish");

  const publicUrl = slug !== null ? buildPublicUrl(props.appOrigin, slug) : null;
  const showWarning =
    sizes !== null &&
    status === "published" &&
    worstCaseExceedsCap(sizes.worstCaseBytes, sizes.submissionCapBytes);

  return (
    <section style={{ ...card, marginBottom: "1rem" }}>
      <div style={{ ...row, marginBottom: "0.9rem" }}>
        <strong style={{ fontSize: "0.95rem" }}>
          {t("dashboard.publish.statusLabel")}:
        </strong>
        <Badge kind={STATUS_BADGE[status]}>{t(STATUS_KEY[status])}</Badge>
        {status === "published" && versionNumber !== null ? (
          <span style={{ color: C.muted, fontSize: "0.9rem" }}>
            {t("dashboard.publish.publishedVersion", { version: versionNumber })}
          </span>
        ) : null}
      </div>

      <div style={row}>
        <button type="button" onClick={onPublish} disabled={busy} style={btn("primary")}>
          {publishLabel}
        </button>
        {status === "published" ? (
          <button type="button" onClick={onUnpublish} disabled={busy} style={btn("secondary")}>
            {phase === "unpublishing"
              ? t("dashboard.publish.unpublishing")
              : t("dashboard.publish.unpublish")}
          </button>
        ) : null}
        {publicUrl !== null ? (
          <button type="button" onClick={onCopy} style={btn("secondary")}>
            {copied
              ? t("dashboard.publish.copied")
              : t("dashboard.publish.copyLink")}
          </button>
        ) : null}
      </div>

      {status === "closed" ? (
        <Alert kind="info" role="note">{t("dashboard.publish.closedMessage")}</Alert>
      ) : null}

      {failed === "publish" ? (
        <Alert kind="error" role="alert">{t("dashboard.publish.publishFailed")}</Alert>
      ) : null}
      {failed === "unpublish" ? (
        <Alert kind="error" role="alert">{t("dashboard.publish.unpublishFailed")}</Alert>
      ) : null}

      {issues !== null && issues.length > 0 ? (
        <Alert kind="error" role="alert">
          <p style={{ fontWeight: 600, margin: "0 0 0.35rem" }}>
            {t("dashboard.publish.validationHeading")}
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {issues.map((issue, i) => (
              <li key={i}>{publishIssueMessage(issue)}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {showWarning && sizes ? (
        <p role="alert" style={{ color: C.warning, margin: "0.75rem 0 0" }}>
          {t("dashboard.publish.worstCaseWarning", {
            worst: bytesAsKb(sizes.worstCaseBytes),
            cap: bytesAsKb(sizes.submissionCapBytes),
          })}
        </p>
      ) : null}

      {publicUrl !== null ? (
        <div
          style={{
            background: C.soft,
            border: `1px solid ${C.border}`,
            borderRadius: "8px",
            padding: "0.75rem 0.9rem",
            marginTop: "0.9rem",
          }}
        >
          <p style={{ margin: "0 0 0.35rem", fontWeight: 600, fontSize: "0.9rem" }}>
            {t("dashboard.publish.publicLinkHeading")}
          </p>
          <p
            style={{
              margin: "0 0 0.5rem",
              wordBreak: "break-all",
              fontSize: "0.9rem",
              color: C.muted,
            }}
          >
            <span>{publicUrl}</span>{" "}
            <a
              href={publicUrl}
              style={{ color: C.ink, fontWeight: 600 }}
              target="_blank"
              rel="noreferrer"
            >
              {t("dashboard.publish.openPublicPage")}
            </a>
          </p>
        </div>
      ) : null}
    </section>
  );
}
