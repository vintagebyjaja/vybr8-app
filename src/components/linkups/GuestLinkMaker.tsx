"use client";

import { useState, useTransition } from "react";

/** Host tool: make a one-person invite link for someone who isn't on VYBR8. */
export function GuestLinkMaker({ create, title }: { create: (label: string) => Promise<{ url?: string; error?: string }>; title: string }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const share = async () => {
    if (!url) return;
    const text = `You're invited to "${title}" on VYBR8. Tap to see the details and RSVP:`;
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); }
    } catch { /* closed the share sheet */ }
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await create(label);
            setError(r.error ?? null);
            setUrl(r.url ?? null);
            setCopied(false);
            if (r.url) setLabel("");
          });
        }}
        className="flex flex-wrap gap-2"
      >
        <label htmlFor="guest-label" className="sr-only">Who is this invite for?</label>
        <input id="guest-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Who's it for? (e.g. Aaliyah)" className="min-h-11 flex-1 rounded-xl border border-line bg-ink px-3 text-sm placeholder:text-faint" />
        <button disabled={pending} className="min-h-11 rounded-full border border-line px-4 text-sm font-bold hover:bg-surface-2 disabled:opacity-50">Make guest link</button>
      </form>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {url && (
        <div className="flex flex-col gap-2 rounded-xl border border-sky/40 bg-sky/5 p-3">
          <p className="text-xs text-muted">Send this link to one person. It works once and you won&rsquo;t see it again after you leave this page.</p>
          <code className="break-all text-sm text-sky">{url}</code>
          <div className="flex gap-2">
            <button type="button" onClick={share} className="vybe-gradient min-h-10 rounded-full px-4 text-sm font-bold text-ink">Share invite</button>
            <button type="button" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }} className="min-h-10 rounded-full border border-line px-4 text-sm font-bold">
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
