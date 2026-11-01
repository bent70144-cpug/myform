import { Suspense } from "react";
import { t } from "@form/i18n";
import { AuthShell, PulseDot } from "../../lib/ui";
import ResetPasswordForm from "./ResetPasswordForm";

/**
 * Reset-password page. The client form is wrapped in Suspense because it
 * reads the `token` search parameter handed over by the emailed link's
 * `/v1/auth/reset-password/:token` callback redirect.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title={t("auth.resetPassword.title")}>
          <p role="status" style={{ color: "#555555", margin: 0 }}>
            <PulseDot />
            {t("common.loading")}
          </p>
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
