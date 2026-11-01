"use client";

import { useState, type FormEvent } from "react";
import { t } from "@form/i18n";
import { Alert, btn, fieldLabel, input } from "../../../lib/ui";

/**
 * Resend-verification prompt — the spec's "dashboard shows a
 * resend-verification prompt" and the verify-email page's resend control.
 * Posts to the SAME-ORIGIN `/v1/auth/send-verification-email`; the endpoint
 * is enumeration-safe (identical generic response for known and unknown
 * addresses), so this UI always reports the same neutral "sent" message and
 * never reveals whether the address exists.
 */
export default function ResendVerificationForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/v1/auth/send-verification-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // 200 = generic accepted (known or unknown address — indistinguishable).
      setSent(res.ok);
      if (!res.ok) setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: "0.5rem" }}>
      <p style={{ color: "#555555", margin: "0 0 0.5rem" }}>{t("auth.resend.prompt")}</p>
      <form onSubmit={onSubmit}>
        <label style={fieldLabel} htmlFor="resend-email">
          {t("auth.signUp.emailLabel")}
        </label>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "stretch", flexWrap: "wrap" }}>
          <input
            id="resend-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...input, flex: "1 1 200px", width: "auto" }}
          />
          <button type="submit" disabled={busy} style={btn("secondary")}>
            {busy ? t("common.loading") : t("auth.resend.action")}
          </button>
        </div>
      </form>
      {sent ? (
        <Alert kind="success">{t("auth.resend.sent")}</Alert>
      ) : null}
      {error ? <Alert kind="error">{t("auth.errors.generic")}</Alert> : null}
    </section>
  );
}
