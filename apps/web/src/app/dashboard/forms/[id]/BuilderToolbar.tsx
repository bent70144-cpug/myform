"use client";

/**
 * Top toolbar for the builder page (client component, ticket 08 chrome).
 *
 * One row that wraps on mobile: back link → "·" → form name → status badge →
 * save pill → Preview. All styling is inline via the shared tokens (this app
 * deliberately has no CSS framework).
 *
 * Deliberately NOT here:
 * - NO Publish button: an e2e test locates THE unique "Publish" button on the
 *   page (rendered by PublishControls) — a second accessible name "Publish"
 *   anywhere else would break that locator.
 * - No data fetching and no router calls: the parent page owns all state.
 *   Conflict and validation messaging render above this toolbar (parent's
 *   concern), and the version line belongs to the publish section.
 */
import * as React from "react";
import Link from "next/link";
import { t } from "@form/i18n";
import { Badge, backLink, btn, C, PulseDot } from "../../../../lib/ui";

type FormStatus = "draft" | "published" | "closed";
type SaveState = "saved" | "saving" | "error";

const STATUS_BADGE_KIND: Record<
  FormStatus,
  "neutral" | "success" | "warning"
> = {
  draft: "neutral",
  published: "success",
  closed: "warning",
};

const STATUS_KEY: Record<
  FormStatus,
  | "dashboard.publish.status.draft"
  | "dashboard.publish.status.published"
  | "dashboard.publish.status.closed"
> = {
  draft: "dashboard.publish.status.draft",
  published: "dashboard.publish.status.published",
  closed: "dashboard.publish.status.closed",
};

export default function BuilderToolbar(props: {
  formName: string;
  status: FormStatus;
  saveState: SaveState;
  previewDisabled?: boolean;
  onPreview: () => void;
}) {
  // ONE always-present live region: e2e's waitForDraftSettled locates the
  // unique role=status on the page and expects "All changes saved" once the
  // autosave settles (strict-mode locator — never render a second one).
  const savePill = (
    <span role="status" style={{ display: "inline-flex", alignItems: "center" }}>
      {props.saveState === "saving" ? (
        <span style={{ fontSize: "0.85rem", color: C.muted }}>
          <PulseDot />
          {t("dashboard.builder.status.saving")}
        </span>
      ) : props.saveState === "saved" ? (
        <Badge kind="success">{t("dashboard.builder.status.saved")}</Badge>
      ) : (
        <Badge kind="danger">{t("dashboard.builder.status.error")}</Badge>
      )}
    </span>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.6rem",
        paddingBottom: "0.9rem",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: "1.25rem",
      }}
    >
      <Link href="/dashboard" style={{ ...backLink, marginBottom: 0 }}>
        {t("dashboard.forms.backToDashboard")}
      </Link>
      <span aria-hidden="true" style={{ color: C.muted }}>
        ·
      </span>
      <strong
        title={props.formName}
        style={{
          maxWidth: 240,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {props.formName}
      </strong>
      <Badge kind={STATUS_BADGE_KIND[props.status]}>
        {t(STATUS_KEY[props.status])}
      </Badge>
      {savePill}
      <button
        type="button"
        style={btn("secondary", { small: true })}
        disabled={props.previewDisabled}
        onClick={props.onPreview}
      >
        {t("dashboard.builder.preview.show")}
      </button>
    </div>
  );
}
