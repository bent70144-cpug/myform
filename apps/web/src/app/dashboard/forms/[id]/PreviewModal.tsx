"use client";

/**
 * Draft preview modal (builder slice C4): renders the CURRENT DRAFT through
 * the SAME presentational component respondents get on the public page —
 * PublicFormView — so what the creator sees is exactly what will ship.
 *
 * Honesty guarantees (spec):
 * - NO second renderer implementation: the stage mounts PublicFormView with
 *   the draft's title and blocks, verbatim (disabled inputs included).
 * - NO network calls, NO session creation, NO routing: the draft never
 *   leaves the page; everything arrives through props.
 * - The Draft badge next to the hint makes it unmistakable this is a draft
 *   preview, not a live published form.
 * - Desktop/Mobile tabs frame the SAME renderer full-width or at the 360px
 *   phone width; PublicFormView is 360px-safe by construction. The frame is
 *   not another card — PublicFormView keeps its own page background.
 * - Escape / backdrop / × closing is Modal's job; nothing is added here.
 *
 * Strings: every label comes from the @form/i18n catalog (the
 * dashboard.builder.preview.* keys, dashboard.publish.status.draft and
 * dashboard.forms.blocksEmpty). No copy is invented in this file.
 */

import * as React from "react";
import type { FormDraftSchema } from "@form/contracts";
import { t } from "@form/i18n";
import { Badge, C, Modal, row, small, Tabs } from "../../../../lib/ui";
import PublicFormView from "../../../f/[slug]/PublicFormView";

/** Mobile frame width — mirrors the public page's 360px-safe target. */
const MOBILE_FRAME_WIDTH = 360;

export default function PreviewModal(props: {
  open: boolean;
  onClose: () => void;
  schema: FormDraftSchema;
}) {
  const [mode, setMode] = React.useState<"desktop" | "mobile">("desktop");
  const empty = props.schema.blocks.length === 0;

  /**
   * Mobile mode wraps the renderer in the spec's 360px frame (strong border,
   * rounded corners, clipped edges); desktop lets it fill the modal panel.
   * In both cases the renderer itself is untouched — same component, same
   * styles, only the surrounding width changes.
   */
  const frameStyle: React.CSSProperties =
    mode === "mobile"
      ? {
          maxWidth: MOBILE_FRAME_WIDTH,
          margin: "0 auto",
          border: `1px solid ${C.borderStrong}`,
          borderRadius: 12,
          overflow: "hidden",
        }
      : { width: "100%" };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t("dashboard.builder.preview.title")}
      width={760}
    >
      {/* Draft hint + status badge (same neutral pill the status line uses). */}
      <div style={{ ...row, alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <p style={{ ...small, flex: 1, margin: 0 }}>
          {t("dashboard.builder.preview.hint")}
        </p>
        <Badge kind="neutral">{t("dashboard.publish.status.draft")}</Badge>
      </div>

      <Tabs
        tabs={[
          { id: "desktop", label: t("dashboard.builder.preview.desktop") },
          { id: "mobile", label: t("dashboard.builder.preview.mobile") },
        ]}
        active={mode}
        onChange={(id) => setMode(id === "mobile" ? "mobile" : "desktop")}
        ariaLabel={t("dashboard.builder.preview.title")}
      />

      {/* The SAME renderer respondents get — no second implementation. */}
      <div style={{ ...frameStyle, marginTop: "1rem" }}>
        <PublicFormView
          title={props.schema.title}
          blocks={props.schema.blocks}
        />
      </div>

      {/* Zero blocks: PublicFormView shows just the title; add the shared
          empty hint as a muted caption below the stage. */}
      {empty ? (
        <p style={{ ...small, margin: "0.75rem 0 0", textAlign: "center" }}>
          {t("dashboard.forms.blocksEmpty")}
        </p>
      ) : null}
    </Modal>
  );
}
