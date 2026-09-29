"use client";

import { useOptimistic, useTransition } from "react";
import { toggleVybe } from "@/app/(app)/post/actions";

/** Instagram-style like, called a "vybe". Optimistic, with the server as the source of truth. */
export function VybeButton({ postId, vybed, count, signedIn }: { postId: string; vybed: boolean; count: number; signedIn: boolean }) {
  const [state, setState] = useOptimistic({ vybed, count });
  const [pending, start] = useTransition();

  if (!signedIn) {
    return (
      <a href={`/auth/sign-in?next=/post/${postId}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm text-muted hover:text-text">
        <Heart filled={false} /> {count}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={state.vybed}
      aria-label={state.vybed ? "Remove vybe" : "Vybe this post"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setState({ vybed: !state.vybed, count: state.count + (state.vybed ? -1 : 1) });
          await toggleVybe(postId);
        })
      }
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm font-semibold ${state.vybed ? "text-coral" : "text-muted hover:text-text"}`}
    >
      <Heart filled={state.vybed} /> {state.count}
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9Z" strokeLinejoin="round" />
    </svg>
  );
}
