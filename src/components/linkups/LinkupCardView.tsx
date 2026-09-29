import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { OCCASIONS } from "@/domain/linkups/linkups";

type Card = {
  id: string; title: string; occasion: keyof typeof OCCASIONS; when: string; place: string | null; capacity: number; spotsLeft: number;
  visibility: string; joinMode: string; isAlcoholic: boolean; openToNewFriends: boolean; host: { name: string; avatarUrl?: string | null }; myStatus: string | null; isHost: boolean;
};

const STATUS: Record<string, string> = { going: "You're going", requested: "Request sent", invited: "You're invited" };

export function LinkupCardView({ card }: { card: Card }) {
  const full = card.spotsLeft === 0;
  return (
    <Link href={`/vybe/${card.id}`} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition hover:border-coral/50 hover:bg-surface-2">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-coral">{OCCASIONS[card.occasion]}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${full ? "bg-surface-2 text-faint" : "vybe-gradient text-ink"}`}>
          {full ? "Full" : `${card.spotsLeft} of ${card.capacity} spots left`}
        </span>
      </div>
      <p className="font-display text-lg font-bold leading-snug">{card.title}</p>
      <p className="text-sm text-muted">{card.when}{card.place ? ` · ${card.place}` : ""}</p>
      <div className="flex flex-wrap gap-2 text-xs text-faint">
        <span className="inline-flex items-center gap-1.5"><Avatar path={card.host.avatarUrl} name={card.host.name} size="sm" ring={false} />{card.isHost ? "You're hosting" : `Hosted by ${card.host.name}`}</span>
        {card.myStatus && !card.isHost && <span className="text-sky">· {STATUS[card.myStatus] ?? card.myStatus}</span>}
        {card.isAlcoholic && <span>· 21+</span>}
        {card.openToNewFriends && <span>· Open to new friends</span>}
        {card.joinMode === "request" && <span>· Host approves</span>}
        {card.visibility === "friends" && <span>· Friends only</span>}
        {card.visibility === "invite_only" && <span>· Invite only</span>}
      </div>
    </Link>
  );
}
