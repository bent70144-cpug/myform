"use client";

import { useState, type FormEvent } from "react";
import { t } from "@form/i18n";
import { PASSWORD_LIMITS } from "@form/auth/password";
import { Alert, AuthShell, btn, fieldStack, Field, input, link } from "../../../lib/ui";

/**
 * Sign-up form. Posts to the SAME-ORIGIN `/v1/auth/sign-up/email` (browser
 * fetch carries the Origin header for the API's global Origin guard; the
 * browser never talks to the internal API URL). Enumeration-safe by
 * contract: an existing address returns the SAME generic success shape, so
 * the UI shows the identical "check your inbox" notice either way — no
 * user-existence signal exists client- or server-side.
 *
 * Password limits come from the shared policy constants (@form/auth/password,
 * the same values the API enforces and ticket 04's reset reuses).
 */
export default function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<null | "passwordPolicy" | "generic">(null);
  const [sentTo, setSentTo] = useState<null | string>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorKey(null);
    try {
      const res = await fetch("/v1/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (res.ok) {
        // Generic success — identical for new AND existing addresses.
        setSentTo(email);
        return;
      }
      let code = "";
      try {
        code = String((await res.json())?.code ?? "");
      } catch {
        code = "";
      }
      setErrorKey(code.startsWith("PASSWORD_TOO") ? "passwordPolicy" : "generic");
    } catch {
      setErrorKey("generic");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo !== null) {
    return (
      <AuthShell title={t("auth.signUp.checkInboxTitle")}>
        <p style={{ margin: "0 0 1rem" }}>
          {t("auth.signUp.checkInboxBody", { email: sentTo })}
        </p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <a href="/verify-email" style={btn("primary")}>
            {t("auth.verifyEmail.title")}
          </a>
          <a href="/sign-in" style={btn("secondary")}>
            {t("auth.signIn.title")}
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.signUp.title")}>
      <form onSubmit={onSubmit} style={fieldStack}>
        <Field label={t("auth.signUp.nameLabel")} htmlFor="signup-name">
          <input
            id="signup-name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={input}
          />
        </Field>
        <Field label={t("auth.signUp.emailLabel")} htmlFor="signup-email">
          <input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
        </Field>
        <Field
          label={t("auth.signUp.passwordLabel")}
          htmlFor="signup-password"
          hint={t("auth.passwordPolicyHint", { min: PASSWORD_LIMITS.min, max: PASSWORD_LIMITS.max })}
        >
          <input
            id="signup-password"
            type="password"
            required
            minLength={PASSWORD_LIMITS.min}
            maxLength={PASSWORD_LIMITS.max}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
          />
        </Field>
        {errorKey ? (
          <Alert kind="error">
            {t(`auth.errors.${errorKey}`, { min: PASSWORD_LIMITS.min, max: PASSWORD_LIMITS.max })}
          </Alert>
        ) : null}
        <button type="submit" disabled={busy} style={btn("primary", { block: true })}>
          {busy ? t("common.loading") : t("auth.signUp.submit")}
        </button>
      </form>
      <p
        style={{
          color: "#555555",
          margin: "1rem 0 0",
          textAlign: "center",
          fontSize: "0.92rem",
        }}
      >
        {t("auth.signUp.haveAccount")}{" "}
        <a href="/sign-in" style={link}>
          {t("auth.signUp.switchToSignIn")}
        </a>
      </p>
      <hr
        style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "1rem 0" }}
      />
      <p style={{ margin: 0, textAlign: "center", fontSize: "0.92rem" }}>
        <a href="/neon-signup" style={link}>
          {t("neonAuth.title")}
        </a>
      </p>
    </AuthShell>
  );
}
