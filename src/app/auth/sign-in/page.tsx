import Link from "next/link";
import { safeNext } from "@/server/safe-redirect";
import { signIn } from "../actions";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-center text-3xl font-bold">Welcome back</h1>
      {error && <p className="rounded-xl border border-danger/40 px-4 py-3 text-sm text-danger">That sign-in link expired. Sign in again.</p>}
      <AuthForm mode="sign-in" action={signIn} next={safeNext(next)} />
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/auth/sign-up" className="font-semibold text-sky underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
