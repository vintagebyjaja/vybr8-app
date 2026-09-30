import Link from "next/link";
import { notFound } from "next/navigation";
import { SUPPORT_EMAIL, topicLabel } from "@/domain/support/support";
import { createClient } from "@/lib/supabase/server";
import { AuthorizationError, requireStaff } from "@/server/auth";
import { updateTicket } from "./actions";

export const metadata = { title: "Support inbox" };

const TABS = [
  { key: "open", label: "Open" },
  { key: "answered", label: "Answered" },
  { key: "closed", label: "Closed" },
] as const;
type Status = (typeof TABS)[number]["key"];
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** A reply that opens in the team's email app, from support@vybr8.live, with the message quoted. */
function replyLink(t: { email: string; name: string | null; topic: string; message: string }): string {
  const hi = t.name ? `Hi ${t.name.split(" ")[0]},` : "Hi,";
  const quoted = t.message.split("\n").map((l) => `> ${l}`).join("\n");
  const body = `${hi}\n\n\n\nThe VYBR8 Team\n${SUPPORT_EMAIL}\n\n${quoted}`;
  return `mailto:${t.email}?${new URLSearchParams({ subject: `Re: ${topicLabel(t.topic)} · VYBR8 Support`, body }).toString().replace(/\+/g, "%20")}`;
}

type Search = { searchParams: Promise<{ status?: string }> };

export default async function SupportInbox({ searchParams }: Search) {
  try {
    await requireStaff();
  } catch (e) {
    if (e instanceof AuthorizationError) notFound(); // don't reveal the team area exists
    throw e;
  }
  const sp = await searchParams;
  const status: Status = TABS.some((t) => t.key === sp.status) ? (sp.status as Status) : "open";
  const supabase = await createClient();
  const [{ data: tickets }, { count: openCount }] = await Promise.all([
    supabase.from("support_tickets")
      .select("id, email, name, topic, message, page, status, staff_note, created_at, updated_at, user:profiles!support_tickets_user_id_fkey ( username ), handler:profiles!support_tickets_handled_by_fkey ( username )")
      .eq("status", status)
      .order("created_at", { ascending: status === "open" })
      .limit(100),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  type T = {
    id: string; email: string; name: string | null; topic: string; message: string; page: string | null; status: Status; staff_note: string | null;
    created_at: string; updated_at: string; user: { username: string } | { username: string }[] | null; handler: { username: string } | { username: string }[] | null;
  };
  const rows = (tickets ?? []) as unknown as T[];
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <Link href="/admin" className="text-sm text-muted hover:text-text">← Admin</Link>
      <header>
        <h1 className="text-3xl font-bold">Support inbox</h1>
        <p className="text-sm text-muted">Messages from Help &amp; Support. Reply opens your email app. Send it from {SUPPORT_EMAIL}, then mark it answered.</p>
      </header>

      <nav aria-label="Status" className="flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/support?status=${t.key}`} aria-current={t.key === status ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-bold ${t.key === status ? "bg-text text-ink" : "border border-line text-muted hover:text-text"}`}>
            {t.label}{t.key === "open" && openCount ? ` (${openCount})` : ""}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{status === "open" ? "Inbox zero. Nice." : "Nothing here."}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((t) => {
            const user = one(t.user);
            const handler = one(t.handler);
            return (
              <li key={t.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold">{topicLabel(t.topic)}</p>
                  <p className="text-xs text-faint">{when(t.created_at)} ET</p>
                </div>
                <p className="text-sm">
                  {t.name ? `${t.name} · ` : ""}<a href={`mailto:${t.email}`} className="text-sky hover:underline">{t.email}</a>
                  {user ? <> · <Link href={`/profile/${user.username}`} className="text-sky hover:underline">@{user.username}</Link></> : <span className="text-faint"> · not signed in</span>}
                  {t.page ? <span className="text-faint"> · from {t.page}</span> : null}
                </p>
                <p className="whitespace-pre-wrap rounded-xl bg-ink p-3 text-sm">{t.message}</p>
                {t.staff_note && <p className="text-xs text-muted">Team note{handler ? ` (@${handler.username})` : ""}: {t.staff_note}</p>}
                <form action={updateTicket} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="id" value={t.id} />
                  <input name="note" maxLength={2000} placeholder="Team note (only the team sees this)" defaultValue={t.staff_note ?? ""} className="min-h-11 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm" />
                  <div className="flex flex-wrap gap-2">
                    <a href={replyLink(t)} className="vybe-gradient inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-ink">Reply by email</a>
                    {t.status !== "answered" && <button name="status" value="answered" className="min-h-11 rounded-full border border-mint/60 px-4 text-sm font-bold text-mint">Answered</button>}
                    {t.status !== "closed" && <button name="status" value="closed" className="min-h-11 rounded-full border border-line px-4 text-sm font-bold text-muted">Close</button>}
                    {t.status !== "open" && <button name="status" value="open" className="min-h-11 rounded-full border border-line px-4 text-sm font-bold text-muted">Reopen</button>}
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
