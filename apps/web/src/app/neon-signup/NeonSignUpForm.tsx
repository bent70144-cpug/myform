"use client";

import { useState, type FormEvent } from "react";
import { t } from "@form/i18n";
import { PASSWORD_LIMITS } from "@form/auth/password";
import { neonAuthClient } from "../../lib/neon-auth/client";
import { Alert, AuthShell, btn, C, fieldStack, Field, input, link } from "../../../lib/ui";

/**
 * Neon Auth (managed Better Auth) email+password sign-up, with the proof
 * built into the page: after signUp.email() succeeds, the CURRENT USER is
 * read back through getSession() and displayed — the same round-trip the
 * node proof script performs (apps/web/scripts/neon-auth-proof.mjs).
 *
 * Errors surface as { data, error } from the managed client; nothing is
 * thrown for expected failures (existing address, weak password), so both
 * the error branch and the success branch are handled explicitly.
 */
interface NeonUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: string | Date;
}

export default function NeonSignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<null | "signUpFailed" | "sessionFailed">(null);
  const [user, setUser] = useState<NeonUser | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorKey(null);
    try {
      const { data, error } = await neonAuthClient.signUp.email({ email, password, name });
      if (error !== null || !data?.user) {
        setErrorKey("signUpFailed");
        return;
      }
      // Read the current user back through the live session.
      const { data: session, error: sessionError } = await neonAuthClient.getSession();
      const current = session?.user as NeonUser | undefined;
      if (sessionError !== null || !current) {
        setErrorKey("sessionFailed");
        return;
      }
      setUser(current);
    } catch {
      setErrorKey("signUpFailed");
    } finally {
      setBusy(false);
    }
  }

  if (user !== null) {
    const rows: Array<[string, string]> = [
      [t("neonAuth.fieldUser"), user.id],
      [t("neonAuth.fieldEmail"), user.email],
      [t("neonAuth.fieldName"), user.name],
      [t("neonAuth.fieldVerified"), String(user.emailVerified)],
      [t("neonAuth.fieldCreated"), String(user.createdAt)],
    ];
    return (
      <AuthShell title={t("neonAuth.currentUserHeading")} width={480}>
        <dl style={{ margin: 0, borderTop: `1px solid ${C.border}` }}>
          {rows.map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "space-between",
                padding: "0.55rem 0",
                borderBottom: `1px solid ${C.border}`,
                flexWrap: "wrap",
              }}
            >
              <dt style={{ fontWeight: 600, fontSize: "0.9rem" }}>{label}</dt>
              <dd
                style={{
                  margin: 0,
                  color: C.muted,
                  wordBreak: "break-all",
                  textAlign: "right",
                  flex: "1 1 auto",
                  minWidth: 0,
                }}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p style={{ marginTop: "1.25rem", marginBottom: 0 }}>
          <a
            href="/neon-signup"
            onClick={(e) => {
              e.preventDefault();
              setUser(null);
              setName("");
              setEmail("");
              setPassword("");
            }}
            style={btn("secondary")}
          >
            {t("neonAuth.tryAgain")}
          </a>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("neonAuth.title")}>
      <p style={{ color: C.muted, margin: "0 0 1rem", fontSize: "0.92rem" }}>
        {t("neonAuth.subtitle")}
      </p>
      <form onSubmit={onSubmit} style={fieldStack}>
        <Field label={t("neonAuth.nameLabel")} htmlFor="neon-signup-name">
          <input
            id="neon-signup-name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={input}
          />
        </Field>
        <Field label={t("neonAuth.emailLabel")} htmlFor="neon-signup-email">
          <input
            id="neon-signup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
        </Field>
        <Field
          label={t("neonAuth.passwordLabel")}
          htmlFor="neon-signup-password"
          hint={t("neonAuth.passwordHint", { min: PASSWORD_LIMITS.min, max: PASSWORD_LIMITS.max })}
        >
          <input
            id="neon-signup-password"
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
        {errorKey ? <Alert kind="error">{t(`neonAuth.${errorKey}`)}</Alert> : null}
        <button type="submit" disabled={busy} style={btn("primary", { block: true })}>
          {busy ? t("common.loading") : t("neonAuth.submit")}
        </button>
      </form>
      <p style={{ margin: "1rem 0 0", textAlign: "center", fontSize: "0.92rem" }}>
        <a href="/sign-up" style={link}>
          {t("auth.signUp.title")}
        </a>
      </p>
    </AuthShell>
  );
}
