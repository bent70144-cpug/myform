import SignUpForm from "./SignUpForm";

/**
 * Sign-up page (email/password, 12–128 policy, verification email on
 * success). The Neon Auth sign-up link lives in the form's footer so it
 * stays inside the card.
 */
export default function SignUpPage() {
  return <SignUpForm />;
}
