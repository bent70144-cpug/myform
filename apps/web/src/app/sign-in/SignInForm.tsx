"use client";

import * as React from "react";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@form/i18n";
import { Alert, AuthShell, btn, fieldStack, Field, input, link, muted } from "../../lib/ui";

/**
 * Sign-in form. Posts to the SAME-ORIGIN `/v1/auth/sign-in/email` (the
 * browser's fetch carries the Origin header and Better Auth's session cookie
 * comes back first-party). Error messages come from the i18n catalog — the
 * single generic credential error (enumeration-safe) maps to one message.
 *
 * Also hosts the password show/hide toggle (an aria-pressed button; the
 * Field's label-for association stays untouched so the password input keeps
 * its accessible name) and the "Forgot your password?" link to the
 * /forgot-password request page.
 */
export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorKey, setErrorKey] = useState<null | "invalidCredentials" | "generic">(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorKey(null);
    try {
      const res = await fetch("/v1/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push(nextPath.startsWith("/") ? nextPath : "/dashboard");
        router.refresh();
        return;
      }
      setErrorKey(res.status === 401 ? "invalidCredentials" : "generic");
    } catch {
      setErrorKey("generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("auth.signIn.title")}>
      <form onSubmit={onSubmit} style={fieldStack}>
        <Field label={t("auth.signIn.emailLabel")} htmlFor="signin-email">
          <input
            id="signin-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
        </Field>
        <Field label={t("auth.signIn.passwordLabel")} htmlFor="signin-password">
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              id="signin-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...input, flex: "1 1 200px", width: "auto" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={t(showPassword ? "auth.signIn.hidePassword" : "auth.signIn.showPassword")}
              aria-pressed={showPassword}
              style={btn("ghost", { small: true })}
            >
              {t(showPassword ? "auth.signIn.hidePassword" : "auth.signIn.showPassword")}
            </button>
          </div>
        </Field>
        {errorKey ? <Alert kind="error">{t(`auth.errors.${errorKey}`)}</Alert> : null}
        <button type="submit" disabled={busy} style={btn("primary", { block: true })}>
          {busy ? t("common.loading") : t("auth.signIn.submit")}
        </button>
        <p style={{ margin: 0, textAlign: "center", fontSize: "0.92rem" }}>
          <a href="/forgot-password" style={link}>
            {t("auth.forgotPassword.title")}
          </a>
        </p>
      </form>
      <p style={{ ...muted, marginTop: "1rem", marginBottom: 0, textAlign: "center" }}>
        {t("auth.signIn.noAccount")}{" "}
        <a href="/sign-up" style={link}>
          {t("auth.signIn.switchToSignUp")}
        </a>
      </p>
    </AuthShell>
  );
}
