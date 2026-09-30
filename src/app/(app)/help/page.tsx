import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FAQ, SUPPORT_EMAIL, SUPPORT_TOPICS, topicLabel } from "@/domain/support/support";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { sendSupport } from "./actions";

export const metadata = { title: "Help & Support" };

const field = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm font-normal placeholder:text-faint focus:border-sky";
const STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: "Waiting on us", tone: "bg-orange/15 text-orange" },
  answered: { label: "Answered by email", tone: "bg-mint/15 text-mint" },
  closed: { label: "Closed", tone: "bg-surface-2 text-muted" },
};

type Search = { searchParams: Promise<{ topic?: string; from?: string; e?: string; sent?: string }> };

export default async function HelpPage({ searchParams }: Search) {
  const sp = await searchParams;
  const viewer = await getViewer();
  let mine: { id: string; topic: string; message: string; status: string; created_at: string }[] = [];
  if (viewer) {
    const supabase = await createClient();
    const { data } = await supabase.from("support_tickets").select("id, topic, message, status, created_at").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(10);
    mine = data ?? [];
  }
  const topic = SUPPORT_TOPICS.some((t) => t.key === sp.topic) ? sp.topic : undefined;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-extrabold">Help &amp; Support</h1>
        <p className="text-sm text-muted">Quick answers below. Still stuck? Message the VYBR8 Team, or email <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-sky hover:underline">{SUPPORT_EMAIL}</a>.</p>
      </header>

      <nav aria-label="Help topics" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FAQ.map((s, i) => (
          <a key={s.title} href={`#faq-${i}`} className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">{s.title}</a>
        ))}
        <a href="#contact" className="vybe-gradient shrink-0 rounded-full px-4 py-2 text-sm font-bold text-ink">Contact us</a>
      </nav>

      {FAQ.map((s, i) => (
        <section key={s.title} id={`faq-${i}`} aria-labelledby={`faq-${i}-h`} className="scroll-mt-4 flex flex-col gap-2">
          <h2 id={`faq-${i}-h`} className="text-lg font-bold">{s.title}</h2>
          <div className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {s.items.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                  {f.q}<span aria-hidden className="text-xl text-faint transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
                {f.link && <Link href={f.link.href} className="mt-2 inline-block text-sm font-semibold text-sky hover:underline">{f.link.label} →</Link>}
              </details>
            ))}
          </div>
        </section>
      ))}

      <section id="contact" aria-labelledby="contact-h" className="scroll-mt-4 flex flex-col gap-4 rounded-[var(--radius-card)] border border-sky/40 bg-surface p-5">
        <div>
          <h2 id="contact-h" className="font-display text-2xl font-extrabold">Message the VYBR8 Team</h2>
          <p className="text-sm text-muted">A real person reads every message. We answer by email, usually within a day.</p>
        </div>

        {sp.sent && <p role="status" className="rounded-xl border border-mint/40 bg-mint/10 p-3 text-sm">Got it. We&rsquo;ll email you back soon.</p>}
        {sp.e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{sp.e}</p>}

        <form action={sendSupport} className="flex flex-col gap-3">
          <input type="hidden" name="page" value={sp.from ?? ""} />
          <div aria-hidden className="absolute -left-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <label className="flex flex-col gap-1 text-sm font-semibold">What&rsquo;s it about?
            <select name="topic" required defaultValue={topic ?? ""} className={field}>
              <option value="" disabled>Pick one</option>
              {SUPPORT_TOPICS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">Email to answer you at
              <input name="email" type="email" required maxLength={254} defaultValue={viewer?.email ?? ""} autoComplete="email" className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Name <span className="font-normal text-faint">(optional)</span>
              <input name="name" maxLength={80} autoComplete="name" className={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold">Message
            <textarea name="message" required minLength={10} maxLength={2000} rows={5} placeholder="Tell us what happened, what you expected, and the place or page if it's about one." className={`${field} py-2`} />
          </label>
          <Button type="submit">Send message</Button>
          <p className="text-xs text-faint">Please don&rsquo;t send passwords or card numbers. If someone is in immediate danger, call 911.</p>
        </form>
      </section>

      {mine.length > 0 && (
        <section aria-labelledby="mine-h" className="flex flex-col gap-2">
          <h2 id="mine-h" className="text-lg font-bold">Your messages</h2>
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
            {mine.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{topicLabel(t.topic)}</p>
                  <p className="line-clamp-2 text-sm text-muted">{t.message}</p>
                  <p className="text-xs text-faint">{new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS[t.status]?.tone ?? ""}`}>{STATUS[t.status]?.label ?? t.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
