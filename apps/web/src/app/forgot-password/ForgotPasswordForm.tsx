"use client";

import * as React from "react";
import { useState, type FormEvent } from "react";
import { t } from "@form/i18n";
import { Alert, AuthShell, btn, fieldStack, Field, input, link, muted } from "../../lib/ui";

/**
 * Forgot-password form — web UI for the API's existing enumeration-safe
 * endpoint. Posts to the SAME-ORIGIN `/v1/auth/request-password-reset` with
 * `{ email, redirectTo }` — Better Auth's exact body schema (the redirectTo
 * becomes the callbackURL of the emailed `/v1/auth/reset-password/:token`
 * link, whose GET callback redirects to the sibling page
 * `/reset-password?token=…` on this same origin).
 *
 * Enumeration safety: the endpoint answers the SAME generic 200 whether or
 * not the address exists, so EVERY 2xx swaps to the identical "check your
 * inbox" state — nothing in this UI distinguishes known from unknown
 * addresses. The 3/h-per-email + 10/h-per-IP rate limiting lives entirely
 * server-side; a 429 renders the same generic error as any other failure.
 */
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<null | string>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/v1/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          // Absolute URL on THIS origin (the auth config's single trusted
          // origin), landing on the reset page that reads `?token=` — the
          // same shape the API's reset test uses for redirectTo.
          redirectTo: new URL("/reset-password", window.location.origin).toString(),
        }),
      });
      if (res.ok) {
        setSentTo(email);
        return;
      }
      setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo !== null) {
    return (
      <AuthShell title={t("auth.forgotPassword.sentTitle")}>
        <Alert kind="info">{t("auth.enumerationSafeResponse", { email: sentTo })}</Alert>
        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <a href="/sign-in" style={btn("secondary")}>
            {t("auth.forgotPassword.backToSignIn")}
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.forgotPassword.title")}>
      <form onSubmit={onSubmit} style={fieldStack}>
        <Field label={t("auth.forgotPassword.emailLabel")} htmlFor="forgot-email">
          <input
            id="forgot-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
        </Field>
        {error ? <Alert kind="error">{t("auth.errors.generic")}</Alert> : null}
        <button type="submit" disabled={busy} style={btn("primary", { block: true })}>
          {busy ? t("common.loading") : t("auth.forgotPassword.submit")}
        </button>
      </form>
      <p style={{ ...muted, marginTop: "1rem", marginBottom: 0, textAlign: "center" }}>
        <a href="/sign-in" style={link}>
          {t("auth.forgotPassword.backToSignIn")}
        </a>
      </p>
    </AuthShell>
  );
}
