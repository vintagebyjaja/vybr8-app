import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { timeAgo } from "@/domain/posts/posts";
import { requireViewer } from "@/server/auth";
import { getNotifications } from "@/server/birthday";
import { markAllRead } from "./actions";

export const metadata = { title: "Alerts" };

export default async function NotificationsPage() {
  const viewer = await requireViewer("/notifications");
  const items = await getNotifications(viewer.id);
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-bold">Alerts</h1>
        {unread > 0 && (
          <form action={markAllRead}><Button type="submit" variant="ghost">Mark all read</Button></form>
        )}
      </header>
      {items.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-muted">
          No alerts yet. Your birthday alert shows up here a week before the big day.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id as string}>
              <Link href={(n.link as string) ?? "/"} className={`flex gap-3 rounded-2xl border p-4 hover:bg-surface-2 ${n.read_at ? "border-line bg-surface" : "vybe-ring"}`}>
                {!n.read_at && <span aria-label="Unread" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-coral" />}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold">{n.title as string}</span>
                  {n.body && <span className="text-sm text-muted">{n.body as string}</span>}
                  <time className="text-xs text-faint" dateTime={n.created_at as string}>{timeAgo(new Date(n.created_at as string))}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-faint">Turn birthday alerts on or off in <Link href="/profile/settings" className="text-sky">settings</Link>.</p>
    </div>
  );
}
