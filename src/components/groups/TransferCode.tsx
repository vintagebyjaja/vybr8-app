"use client";

import { useState, useTransition } from "react";

/** Guardian makes a one-time code so their kid (13+) can take over their own profile. */
export function TransferCode({ create, name }: { create: () => Promise<{ code?: string; error?: string }>; name: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      {code ? (
        <div className="flex flex-col gap-2 rounded-xl border border-sky/40 bg-sky/5 p-3">
          <p className="text-sm">Give {name} this code. They sign up for VYBR8 (13+), open <b>Groups → Take over my profile</b>, and enter it. It works once and expires in 30 days.</p>
          <code className="select-all break-all font-display text-lg font-extrabold tracking-wider text-sky">{code}</code>
          <p className="text-xs text-faint">You won&rsquo;t see this code again. Making a new one cancels the old one.</p>
        </div>
      ) : (
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await create(); setCode(r.code ?? null); setError(r.error ?? null); })}
          className="vybe-gradient min-h-11 self-start rounded-full px-5 text-sm font-bold text-ink disabled:opacity-50">
          {pending ? "Making code…" : "Make a transfer code"}
        </button>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
