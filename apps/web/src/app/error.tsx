"use client";

import { useEffect } from "react";
import { t } from "@form/i18n";
import { AuthShell, btn, C, muted, row, small } from "../lib/ui";

/**
 * App-wide React error boundary (client by necessity — the error/reset
 * lifecycle is client-side). When rendering throws, the visitor gets a
 * branded recovery screen with a Try-again action instead of Next's default
 * crash page. Errors are logged to the console for the server logs.
 *
 * Layout is deliberately plain typography — title, body, primary Try-again
 * plus secondary Back-to-home — with the opaque error digest (an id, not a
 * stack trace) shown as muted code only when Next provides one.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AuthShell title={t("errors.internal.title")}>
      <p style={muted}>{t("errors.internal.body")}</p>
      <div style={{ ...row, marginTop: "0.25rem" }}>
        <button type="button" onClick={reset} style={btn("primary")}>
          {t("errors.internal.retry")}
        </button>
        <a href="/" style={btn("secondary")}>
          {t("common.backHome")}
        </a>
      </div>
      {error.digest ? (
        <p
          style={{
            ...small,
            margin: "1.25rem 0 0",
            paddingTop: "0.9rem",
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <code
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "0.85rem",
            }}
          >
            {error.digest}
          </code>
        </p>
      ) : null}
    </AuthShell>
  );
}
