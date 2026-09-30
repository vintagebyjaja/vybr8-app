import Link from "next/link";
import { LinkupForm } from "@/components/linkups/LinkupForm";
import { CITIES, findCity } from "@/domain/map/map";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { getPickedPlace } from "@/server/places";
import { getViewerCity } from "@/server/map";

export const metadata = { title: "Start a Link Up" };

type Props = { searchParams: Promise<{ venue?: string; city?: string }> };

export default async function NewLinkupPage({ searchParams }: Props) {
  const viewer = await requireViewer("/vybe/new");
  const { venue, city: cityParam } = await searchParams;
  const city = findCity(await getViewerCity(viewer, cityParam));
  const supabase = await createClient();
  const defaultVenue = await getPickedPlace({ slug: venue });
  const venueCity = defaultVenue?.city ?? undefined;
  const { data: me } = await supabase.from("profiles").select("avatar_url").eq("id", viewer.id).single();
  if (!me?.avatar_url) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-3xl font-extrabold">Start a <span className="vybe-text">Link Up</span></h1>
        <p className="rounded-xl border border-orange/40 bg-orange/10 p-4">
          Add a profile photo first. Everyone in a Link Up shows their photo and name, so the group knows who&rsquo;s coming.
        </p>
        <Link href="/profile/settings" className="vybe-gradient self-start rounded-full px-6 py-3 text-sm font-bold text-ink">Add a photo</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-extrabold">Start a <span className="vybe-text">Link Up</span></h1>
        <p className="mt-1 text-muted">Set the plan, pick how many spots, and a group chat opens for everyone who&rsquo;s going.</p>
      </header>
      <LinkupForm
        cities={CITIES.map((c) => ({ slug: c.slug, name: c.name }))}
        defaultCity={venueCity ?? city.slug}
        defaultVenue={defaultVenue}
        canDrink={viewer.is21Plus}
        isAdult={viewer.isAdult}
        turns21On={!viewer.is21Plus && viewer.birthdate ? turns21(viewer.birthdate) : null}
        today={new Intl.DateTimeFormat("en-CA", { timeZone: city.timezone }).format(new Date())}
      />
    </div>
  );
}

/** "YYYY-MM-DD" of the 21st birthday if it's within the 90-day planning window, else null. */
function turns21(birthdate: string): string | null {
  const [y, m, d] = birthdate.split("-").map(Number) as [number, number, number];
  const day = m === 2 && d === 29 && !((y + 21) % 4 === 0 && ((y + 21) % 100 !== 0 || (y + 21) % 400 === 0)) ? 28 : d;
  const iso = `${y + 21}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const days = (Date.parse(iso) - Date.now()) / 86_400_000;
  return days <= 90 ? iso : null;
}
