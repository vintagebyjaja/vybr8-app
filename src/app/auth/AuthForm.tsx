"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { AuthState } from "./actions";

/** Latest birthdate that is 13 today (the server re-checks; this just guides the date picker). */
function latestAllowedBirthdate() {
  const now = new Date();
  return new Date(now.getFullYear() - 13, now.getMonth(), now.getDate()).toLocaleDateString("en-CA");
}

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "sign-in" | "sign-up";
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const maxBirthdate = mode === "sign-up" ? latestAllowedBirthdate() : undefined;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "sign-up" && (
        <>
          <Field id="username" label="Username" autoComplete="username" required hint="This is how friends find you." />
          <Field id="displayName" label="Name (optional)" autoComplete="name" />
          <Field
            id="birthdate"
            label="Birthday"
            type="date"
            autoComplete="bday"
            required
            max={maxBirthdate}
            hint="You must be 13 or older. Cocktail posts and drink perks unlock at 21. We never show your birthday to anyone."
          />
        </>
      )}
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
        required
        hint={mode === "sign-up" ? "At least 10 characters." : undefined}
      />
      <div aria-live="polite" className="min-h-5 text-sm">
        {state.error && <p className="text-danger">{state.error}</p>}
        {state.message && <p className="text-mint">{state.message}</p>}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "One sec…" : mode === "sign-in" ? "Sign in" : "Create account"}
      </Button>
    </form>
  );
}
