"use client";

import { useState } from "react";

/**
 * Share a VYBR8 page: opens the phone's share sheet (Messages, Instagram, Snapchat, WhatsApp…).
 * Where that isn't available (most desktops), shows Copy link and Text it instead.
 */
export function ShareButton({ path, title, text, compact = false }: { path: string; title: string; text?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}${path}`;
  const message = text ?? `${title} on VYBR8`;

  async function share() {
    const data = { title, text: message, url: url() };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try { await navigator.share(data); } catch { /* closed the sheet */ }
      return;
    }
    setOpen((o) => !o);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={share} aria-label={compact ? `Share ${title}` : undefined}
        className={compact
          ? "grid size-10 place-items-center rounded-full border border-line text-muted hover:bg-surface-2 hover:text-text"
          : "inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2"}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
          <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
        {!compact && "Share"}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-2 flex w-48 flex-col rounded-xl border border-line bg-surface-2 p-1 text-sm shadow-xl">
          <button type="button" onClick={copy} className="rounded-lg px-3 py-2 text-left font-semibold hover:bg-surface">{copied ? "Link copied ✓" : "Copy link"}</button>
          <a href={`sms:?&body=${encodeURIComponent(`${message} ${url()}`)}`} className="rounded-lg px-3 py-2 font-semibold hover:bg-surface">Text it to a friend</a>
        </span>
      )}
    </span>
  );
}
