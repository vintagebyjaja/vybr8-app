"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";

export type ChatMessage = { id: string; author: string; isGuest: boolean; isMe: boolean; body: string; createdAt: string };

/**
 * Link Up group chat. Members get live updates over Supabase Realtime; guests (no account)
 * refresh every few seconds. The whole chat disappears when the Link Up ends.
 */
export function GroupChat({
  initial,
  load,
  send,
  realtimeLinkupId,
  endsAt,
  timezone,
}: {
  initial: ChatMessage[];
  load: () => Promise<ChatMessage[]>;
  send: (body: string) => Promise<string | null>;
  realtimeLinkupId?: string;
  endsAt: string;
  timezone: string;
}) {
  const [messages, setMessages] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => load().then((m) => alive && setMessages(m)).catch(() => {});
    const timer = setInterval(refresh, realtimeLinkupId ? 20_000 : 5_000);
    let cleanup = () => {};
    if (realtimeLinkupId) {
      const supabase = createClient();
      const channel = supabase
        .channel(`linkup-${realtimeLinkupId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "linkup_messages", filter: `linkup_id=eq.${realtimeLinkupId}` }, refresh)
        .subscribe();
      cleanup = () => void supabase.removeChannel(channel);
    }
    return () => { alive = false; clearInterval(timer); cleanup(); };
  }, [load, realtimeLinkupId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const ends = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(endsAt));

  return (
    <section aria-labelledby="chat-h" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="chat-h" className="text-lg font-bold">Group chat</h2>
        <p className="text-xs text-faint">This chat disappears after the Link Up ends ({ends}).</p>
      </div>
      <ol ref={listRef} aria-live="polite" className="flex max-h-96 min-h-40 flex-col gap-2 overflow-y-auto pr-1">
        {messages.length === 0 && <li className="m-auto text-sm text-muted">Say hi and make the plan.</li>}
        {messages.map((m) => (
          <li key={m.id} className={`flex max-w-[85%] flex-col ${m.isMe ? "self-end items-end" : "self-start"}`}>
            {!m.isMe && (
              <span className="px-1 text-xs text-faint">
                {m.author}{m.isGuest ? " · guest" : ""}
              </span>
            )}
            <span className={`rounded-2xl px-3 py-2 text-sm ${m.isMe ? "vybe-gradient text-ink" : "bg-surface-2"}`}>{m.body}</span>
          </li>
        ))}
      </ol>
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("body") as HTMLInputElement;
          const body = input.value.trim();
          if (!body) return;
          start(async () => {
            const err = await send(body);
            setError(err);
            if (!err) {
              input.value = "";
              setMessages(await load());
            }
          });
        }}
        className="flex gap-2"
      >
        <label htmlFor="chat-body" className="sr-only">Message</label>
        <input id="chat-body" name="body" maxLength={1000} autoComplete="off" placeholder="Message the group" className="min-h-11 flex-1 rounded-full border border-line bg-ink px-4 text-sm placeholder:text-faint" />
        <button disabled={pending} className="vybe-gradient min-h-11 rounded-full px-5 text-sm font-bold text-ink disabled:opacity-50">Send</button>
      </form>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
