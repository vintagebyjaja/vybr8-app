import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { GroupChat } from "@/components/linkups/GroupChat";
import { GuestAcceptForm } from "@/components/linkups/GuestAcceptForm";
import { formatWhen, OCCASIONS, type Occasion } from "@/domain/linkups/linkups";
import { CITIES } from "@/domain/map/map";
import { createClient } from "@/lib/supabase/server";
import { toChat } from "@/server/linkups";
import { guestAccept, guestDecline, guestLoadChat, guestSendChat } from "../actions";

export const metadata: Metadata = { title: "You're invited", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Invite = {
  invite_status: "pending" | "accepted" | "declined";
  guest_name: string | null; label: string | null; title: string; occasion: Occasion; description: string | null;
  starts_at: string; ends_at: string; is_over: boolean; is_alcoholic: boolean; capacity: number; spots_taken: number;
  city: string | null; place: string | null; address: string | null; host: string; going: string[];
};

type Props = { params: Promise<{ token: string }> };

export default async function GuestInvitePage({ params }: Props) {
  const { token } = await params;
  const valid = /^[A-Za-z0-9-]{8,96}$/.test(token);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("guest_view_invite", { p_token: token }) : { data: null };
  const inv = data as Invite | null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-8">
      <Link href="/" aria-label="VYBR8 home">
        <Image src="/brand-wordmark.webp" alt="VYBR8" width={600} height={200} className="h-auto w-36 mix-blend-lighten" />
      </Link>
      {!inv ? (
        <section className="flex flex-col gap-3">
          <h1 className="text-3xl font-extrabold">This invite link isn&rsquo;t working</h1>
          <p className="text-muted">The host may have turned it off. Ask them to send you a new one.</p>
        </section>
      ) : (
        <Invitation token={token} inv={inv} />
      )}
    </main>
  );
}

async function Invitation({ token, inv }: { token: string; inv: Invite }) {
  const cityName = inv.city?.split(",")[0];
  const tz = CITIES.find((c) => c.name === cityName)?.timezone ?? "America/New_York";
  const when = formatWhen(new Date(inv.starts_at), tz);
  const ends = formatWhen(new Date(inv.ends_at), tz).split(" · ")[1];
  const left = Math.max(0, inv.capacity - inv.spots_taken);
  const accepted = inv.invite_status === "accepted";
  const chat = accepted && !inv.is_over ? toChat((await (await createClient()).rpc("guest_messages", { p_token: token })).data) : [];

  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          {inv.host} invited {accepted ? "you" : inv.label ? inv.label : "you"} to a Link Up
        </p>
        <span className="text-xs font-bold uppercase tracking-wide text-coral">{OCCASIONS[inv.occasion] ?? "Link Up"}{inv.is_alcoholic ? " · 21+" : ""}</span>
        <h1 className="text-3xl font-extrabold leading-tight">{inv.title}</h1>
        <p className="text-lg">{when} – {ends}</p>
        <p className="text-muted">{[inv.place, inv.address ?? inv.city].filter(Boolean).join(" · ")}</p>
        {inv.description && <p className="whitespace-pre-line">{inv.description}</p>}
      </header>

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <h2 className="font-bold">Going ({inv.going.length}/{inv.capacity})</h2>
        <p className="mt-1 text-sm text-muted">{inv.going.join(", ")}</p>
        {!accepted && !inv.is_over && <p className="mt-1 text-xs text-faint">{left === 0 ? "It's full right now." : `${left} ${left === 1 ? "spot" : "spots"} left`}</p>}
      </section>

      {inv.is_over ? (
        <p className="rounded-xl border border-line p-4 text-muted">This Link Up is over, and its group chat is gone.</p>
      ) : accepted ? (
        <>
          <p role="status" className="rounded-xl border border-sky/40 bg-sky/10 p-3 text-sm">
            You&rsquo;re going, {inv.guest_name}! Keep this link. It&rsquo;s your way back to the details and the group chat.
          </p>
          <GroupChat initial={chat} load={guestLoadChat.bind(null, token)} send={guestSendChat.bind(null, token)} endsAt={inv.ends_at} timezone={tz} />
        </>
      ) : inv.invite_status === "declined" ? (
        <p className="rounded-xl border border-line p-4 text-muted">You said you can&rsquo;t make it. Thanks for letting {inv.host} know.</p>
      ) : (
        <GuestAcceptForm
          accept={guestAccept.bind(null, token)}
          decline={guestDecline.bind(null, token)}
          defaultName={inv.label ?? ""}
          isAlcoholic={inv.is_alcoholic}
          full={left === 0}
        />
      )}

      <aside className="vybe-ring mt-4 flex flex-col gap-2 rounded-[var(--radius-card)] p-5">
        <p className="font-display text-lg font-bold">Find your next plate or pour</p>
        <p className="text-sm text-muted">VYBR8 shows you the best actual dishes and drinks in your city, what your people are eating, and makes it easy to link up.</p>
        <Link href="/auth/sign-up" className="vybe-gradient mt-1 self-start rounded-full px-5 py-2.5 text-sm font-bold text-ink">Join VYBR8</Link>
      </aside>
    </>
  );
}
