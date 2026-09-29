"use client";

import { useActionState } from "react";

type State = { error?: string };

export function GuestAcceptForm({
  accept, decline, defaultName, isAlcoholic, full,
}: {
  accept: (s: State, f: FormData) => Promise<State>;
  decline: () => Promise<void>;
  defaultName: string;
  isAlcoholic: boolean;
  full: boolean;
}) {
  const [state, action, pending] = useActionState(accept, {});
  const input = "min-h-11 rounded-xl border border-line bg-surface px-3 text-text placeholder:text-faint focus:border-sky";
  return (
    <section aria-labelledby="rsvp-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <h2 id="rsvp-h" className="text-lg font-bold">RSVP</h2>
      {full ? (
        <p className="text-sm text-muted">This Link Up is full right now. If a spot opens, this link will let you in.</p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-semibold">Your name</label>
            <input id="name" name="name" required maxLength={40} defaultValue={defaultName} autoComplete="given-name" className={input} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="birthdate" className="text-sm font-semibold">Your birthday</label>
            <input id="birthdate" name="birthdate" type="date" required autoComplete="bday" className={input} />
            <p className="text-xs text-faint">
              {isAlcoholic ? "This Link Up has drinks, so you must be 21 by the day it happens." : "VYBR8 is for people 13 and older."} We only use it to check your age, and delete it after the event.
            </p>
          </div>
          {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
          <button disabled={pending} className="vybe-gradient min-h-11 rounded-full text-sm font-bold text-ink disabled:opacity-50">
            {pending ? "Saving…" : "I'm in"}
          </button>
        </form>
      )}
      <form action={decline}>
        <button className="min-h-10 w-full rounded-full border border-line text-sm font-bold text-muted hover:bg-surface-2">Can&rsquo;t make it</button>
      </form>
    </section>
  );
}
