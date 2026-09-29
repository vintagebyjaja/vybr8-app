import Link from "next/link";
import { signUp } from "../actions";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">
          Find your <span className="vybe-text">vybe</span>
        </h1>
        <p className="mt-2 text-sm text-muted">Eat. Drink. Link up. For ages 13+.</p>
        <p className="mt-1 text-xs text-faint">Coffee, tea, matcha, boba and lemonade are for everyone. Only alcohol is 21+.</p>
      </div>
      <AuthForm mode="sign-up" action={signUp} />
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-semibold text-sky underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
