import SignUpForm from "./SignUpForm";
import { t } from "@form/i18n";

/** Sign-up page (email/password, 12–128 policy, verification email on success). */
export default function SignUpPage() {
  return (
    <>
      <SignUpForm />
      <p style={{ textAlign: "center", margin: "0 0 2rem" }}>
        <a href="/neon-signup">{t("neonAuth.title")}</a>
      </p>
    </>
  );
}
