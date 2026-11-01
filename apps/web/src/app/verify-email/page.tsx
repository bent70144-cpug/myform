import { t } from "@form/i18n";
import { Alert, AuthShell, btn, muted } from "../../lib/ui";
import ResendVerificationForm from "./ResendVerificationForm";

/**
 * Verify-email landing page — the callbackURL Better Auth redirects to after
 * the emailed link. Next.js server component (searchParams is a Promise in
 * Next 15+/16). `?error=…` marks an invalid/expired token; anything else is
 * the success path. Includes the enumeration-safe resend control.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = params.error;
  const failed = typeof error === "string" && error.length > 0;

  return (
    <AuthShell title={t("auth.verifyEmail.title")}>
      {failed ? (
        <Alert kind="error">{t("auth.verifyEmail.failed")}</Alert>
      ) : (
        <Alert kind="success">{t("auth.verifyEmail.success")}</Alert>
      )}
      <ResendVerificationForm />
      <p style={{ ...muted, marginTop: "0.9rem" }}>{t("auth.verifyEmail.resendHere")}</p>
      <a href="/sign-in" style={btn("secondary")}>
        {t("auth.verifyEmail.backToSignIn")}
      </a>
    </AuthShell>
  );
}
