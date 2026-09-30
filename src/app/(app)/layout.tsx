import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertsLink } from "@/components/nav/AlertsLink";
import { BackButton } from "@/components/nav/BackButton";
import { BottomNav } from "@/components/nav/BottomNav";
import { MobileMoreNav } from "@/components/nav/MobileMoreNav";
import { SideNav } from "@/components/nav/SideNav";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { isDemoMode } from "@/config/public-env";
import { getViewer } from "@/server/auth";
import { getUnreadCount } from "@/server/birthday";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  // Everyone must give a birthday (13+) before using VYBR8 (email sign-ups already did).
  if (viewer && !viewer.birthdate) redirect("/welcome/birthday");
  const unread = viewer ? await getUnreadCount(viewer.id) : 0;

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        {isDemoMode && (
          <div className="flex items-center justify-center gap-2 border-b border-line bg-surface px-4 py-1.5 text-xs text-muted">
            <DemoBadge label="Demo mode" /> Venues and people shown are fictional development data.
          </div>
        )}
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 pt-4 md:px-8">
          <BackButton />
          <div className="flex items-center gap-2">
          <Link href="/birthday" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
            <span className="vybe-text">Birthday Perks</span>
          </Link>
          {viewer && <AlertsLink unread={unread} />}
          </div>
        </div>
        <MobileMoreNav />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-4 md:px-8 md:pb-12">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
