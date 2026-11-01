"use client";

import { useState, type FormEvent } from "react";
import { t } from "@form/i18n";
import { PASSWORD_LIMITS } from "@form/auth/password";
import { neonAuthClient } from "../../lib/neon-auth/client";

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

  const labelStyle = { display: "block", marginBottom: 4 } as const;

  if (user !== null) {
    return (
      <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1>{t("neonAuth.currentUserHeading")}</h1>
        <table style={{ borderCollapse: "collapse", marginTop: "1rem" }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>{t("neonAuth.fieldUser")}</td>
              <td style={{ padding: "4px 0" }}>{user.id}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>{t("neonAuth.fieldEmail")}</td>
              <td style={{ padding: "4px 0" }}>{user.email}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>{t("neonAuth.fieldName")}</td>
              <td style={{ padding: "4px 0" }}>{user.name}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>{t("neonAuth.fieldVerified")}</td>
              <td style={{ padding: "4px 0" }}>{String(user.emailVerified)}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>{t("neonAuth.fieldCreated")}</td>
              <td style={{ padding: "4px 0" }}>{String(user.createdAt)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: "1.5rem" }}>
          <a
            href="/neon-signup"
            onClick={(e) => {
              e.preventDefault();
              setUser(null);
              setName("");
              setEmail("");
              setPassword("");
            }}
          >
            {t("neonAuth.tryAgain")}
          </a>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 360, margin: "0 auto" }}>
      <h1>{t("neonAuth.title")}</h1>
      <p style={{ color: "#555" }}>{t("neonAuth.subtitle")}</p>
      <form onSubmit={onSubmit}>
        <label style={labelStyle}>
          {t("neonAuth.nameLabel")}
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          />
        </label>
        <label style={labelStyle}>
          {t("neonAuth.emailLabel")}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          />
        </label>
        <label style={labelStyle}>
          {t("neonAuth.passwordLabel")}
          <input
            type="password"
            required
            minLength={PASSWORD_LIMITS.min}
            maxLength={PASSWORD_LIMITS.max}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", marginBottom: 4 }}
          />
        </label>
        <p style={{ margin: "0 0 12px", color: "#555" }}>
          {t("neonAuth.passwordHint", { min: PASSWORD_LIMITS.min, max: PASSWORD_LIMITS.max })}
        </p>
        {errorKey ? (
          <p role="alert" style={{ color: "#b00020" }}>
            {t(`neonAuth.${errorKey}`)}
          </p>
        ) : null}
        <button type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? t("common.loading") : t("neonAuth.submit")}
        </button>
      </form>
      <p>
        <a href="/sign-up">{t("auth.signUp.title")}</a>
      </p>
    </main>
  );
}
