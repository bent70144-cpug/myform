"use client";

import { useEffect } from "react";
import { t } from "@form/i18n";
import { Alert, AuthShell, btn } from "../lib/ui";

/**
 * App-wide React error boundary (client by necessity — the error/reset
 * lifecycle is client-side). When rendering throws, the visitor gets a
 * branded recovery screen with a Try-again action instead of Next's default
 * crash page. Errors are logged to the console for the server logs.
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
      <Alert kind="error">{t("errors.internal.body")}</Alert>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
        <button type="button" onClick={reset} style={btn("primary")}>
          {t("errors.internal.retry")}
        </button>
        <a href="/" style={btn("secondary")}>
          {t("common.backHome")}
        </a>
      </div>
    </AuthShell>
  );
}
