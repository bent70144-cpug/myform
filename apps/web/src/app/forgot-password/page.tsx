import ForgotPasswordForm from "./ForgotPasswordForm";

/**
 * Forgot-password page. The form reads no search parameters, so unlike the
 * reset-password page it needs no Suspense boundary around the client form.
 */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
