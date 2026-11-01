"use client";

import * as React from "react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { t } from "@form/i18n";
import { PASSWORD_LIMITS } from "@form/auth/password";
import { Alert, AuthShell, btn, fieldStack, Field, input } from "../../lib/ui";

/**
 * Reset-password form — the landing target of the emailed reset link. That
 * link points at `/v1/auth/reset-password/:token?callbackURL=…`, whose GET
 * callback 302-redirects to THIS page as `/reset-password?token=…`, so the
 * single-use token arrives as a search parameter.
 *
 * Posts to the SAME-ORIGIN `/v1/auth/reset-password` with `{ token,
 * newPassword }` — Better Auth's exact body schema. The API redeems the
 * token exactly once (expired/used tokens answer 400) and revokes ALL of
 * the user's sessions on success. The token is never rendered or logged —
 * it only travels inside the request body.
 *
 * Status mapping: 2xx → success notice + sign-in link; 400/422 → the
 * invalid-token notice (used, expired, or policy-rejected — the form's own
 * minLength/maxLength make a policy 400 unlikely); network/other → the
 * generic error. A missing/empty token (e.g. the callback's INVALID_TOKEN
 * redirect landing without one) shows the invalid-token notice immediately,
 * with no form to submit.
 */
export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [errorKey, setErrorKey] = useState<null | "invalidToken" | "generic">(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorKey(null);
    try {
      const res = await fetch("/v1/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, newPassword }),
      });
      if (res.ok) {
        setSuccess(true);
        return;
      }
      setErrorKey(res.status === 400 || res.status === 422 ? "invalidToken" : "generic");
    } catch {
      setErrorKey("generic");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title={t("auth.resetPassword.title")}>
        <Alert kind="error">{t("auth.resetPassword.invalidToken")}</Alert>
        <div style={{ marginTop: "1rem" }}>
          <a href="/sign-in" style={btn("secondary")}>
            {t("auth.resetPassword.backToSignIn")}
          </a>
        </div>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell title={t("auth.resetPassword.title")}>
        <Alert kind="success">{t("auth.resetPassword.success")}</Alert>
        <div style={{ marginTop: "1rem" }}>
          <a href="/sign-in" style={btn("primary", { block: true })}>
            {t("auth.resetPassword.backToSignIn")}
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.resetPassword.title")}>
      <form onSubmit={onSubmit} style={fieldStack}>
        <Field
          label={t("auth.resetPassword.newPasswordLabel")}
          htmlFor="reset-password"
          hint={t("auth.passwordPolicyHint", { min: PASSWORD_LIMITS.min, max: PASSWORD_LIMITS.max })}
        >
          <input
            id="reset-password"
            type="password"
            required
            minLength={PASSWORD_LIMITS.min}
            maxLength={PASSWORD_LIMITS.max}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={input}
          />
        </Field>
        {errorKey ? (
          <Alert kind="error">
            {errorKey === "invalidToken"
              ? t("auth.resetPassword.invalidToken")
              : t("auth.errors.generic")}
          </Alert>
        ) : null}
        <button type="submit" disabled={busy} style={btn("primary", { block: true })}>
          {busy ? t("common.loading") : t("auth.resetPassword.submit")}
        </button>
      </form>
    </AuthShell>
  );
}
