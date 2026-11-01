import { Suspense } from "react";
import { t } from "@form/i18n";
import { AuthShell, PulseDot } from "../../lib/ui";
import SignInForm from "./SignInForm";

/**
 * Sign-in page. The client form is wrapped in Suspense because it reads the
 * `next` search parameter (redirect target after a middleware bounce).
 */
export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title={t("auth.signIn.title")}>
          <p role="status" style={{ color: "#555555", margin: 0 }}>
            <PulseDot />
            {t("common.loading")}
          </p>
        </AuthShell>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
