"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { confirmBirthday } from "./actions";

export function BirthdayForm() {
  const [state, action, pending] = useActionState(confirmBirthday, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="birthdate" label="Birthday" type="date" autoComplete="bday" required hint="You can't change this later without contacting the VYBR8 team." />
      <div aria-live="polite" className="min-h-5 text-sm">{state.error && <p className="text-danger">{state.error}</p>}</div>
      <Button type="submit" disabled={pending}>{pending ? "One sec…" : "Continue"}</Button>
    </form>
  );
}
