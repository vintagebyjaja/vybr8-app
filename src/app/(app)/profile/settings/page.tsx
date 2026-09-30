import Link from "next/link";
import { PhotoUpload } from "@/components/profile/PhotoUpload";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { saveSettings } from "./actions";

export const metadata = { title: "Settings" };

const SURFACES = [
  { key: "profile_visibility", label: "Profile", help: "Who can open your profile page" },
  { key: "ratings_visibility", label: "Ratings", help: "Your dish, drink and venue ratings" },
  { key: "saves_visibility", label: "Saves", help: "Favorites and Want to Try" },
  { key: "taste_visibility", label: "Taste profile", help: "What you're into, used for Taste Match" },
  { key: "activity_visibility", label: "Activity", help: "Recent ratings and saves in friends' feeds" },
  { key: "dietary_visibility", label: "Dietary info", help: "Group Vybe still respects it, without naming it to others" },
] as const;

const OPTIONS = [
  { value: "public", label: "Everyone" },
  { value: "friends", label: "Friends" },
  { value: "private", label: "Only me" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; welcome?: string }> }) {
  const viewer = await requireViewer("/profile/settings");
  const { saved, error, welcome } = await searchParams;
  const supabase = await createClient();
  const [{ data: profile }, { data: privacy }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("username, display_name, bio, home_city, avatar_url").eq("id", viewer.id).single(),
    supabase.from("privacy_settings").select("*").eq("user_id", viewer.id).single(),
    supabase.from("user_settings").select("notification_prefs").eq("user_id", viewer.id).single(),
  ]);
  const birthdayAlerts = (settings?.notification_prefs as { birthday?: boolean } | null)?.birthday !== false;
  const birthday = viewer.birthdate
    ? new Date(`${viewer.birthdate}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <form action={saveSettings} className="mx-auto flex max-w-2xl flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold">{welcome ? "Welcome to VYBR8" : "Profile & privacy"}</h1>
        <p className="mt-1 text-muted">@{profile?.username}</p>
      </header>

      <div aria-live="polite">
        {saved && <p className="rounded-xl border border-mint/40 px-4 py-3 text-sm text-mint">Saved.</p>}
        {error && <p className="rounded-xl border border-danger/40 px-4 py-3 text-sm text-danger">We couldn&rsquo;t save that. Check the fields and try again.</p>}
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-bold">Profile</legend>
        <PhotoUpload userId={viewer.id} path={(profile?.avatar_url as string | null) ?? null} name={(profile?.display_name as string | null) ?? (profile?.username as string) ?? "?"} />
        <a href="/verify" className="self-start text-sm font-semibold text-sky">Get ID verified →</a>
        {[
          { id: "display_name", label: "Name", value: profile?.display_name, max: 60 },
          { id: "home_city", label: "Home city", value: profile?.home_city, max: 80 },
        ].map((f) => (
          <div key={f.id} className="flex flex-col gap-1.5">
            <label htmlFor={f.id} className="text-sm font-semibold">{f.label}</label>
            <input id={f.id} name={f.id} defaultValue={f.value ?? ""} maxLength={f.max} className="min-h-11 rounded-xl border border-line bg-surface px-3" />
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bio" className="text-sm font-semibold">Bio</label>
          <textarea id="bio" name="bio" defaultValue={profile?.bio ?? ""} maxLength={280} rows={3} className="rounded-xl border border-line bg-surface px-3 py-2" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-bold">Who can see what</legend>
        {SURFACES.map((s) => (
          <div key={s.key} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label htmlFor={s.key} className="font-semibold">{s.label}</label>
              <p className="text-xs text-faint">{s.help}</p>
            </div>
            <select id={s.key} name={s.key} defaultValue={privacy?.[s.key] ?? "friends"} className="min-h-11 rounded-xl border border-line bg-surface-2 px-3">
              {OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-2xl border border-mint/30 bg-surface p-4">
          <div>
            <p className="font-semibold">Health</p>
            <p className="text-xs text-faint">Always private. Never shown to friends, businesses or other users.</p>
          </div>
          <span className="text-sm font-semibold text-mint">Only me</span>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-bold">Birthday</legend>
        <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
          <p className="font-semibold">{birthday ?? "Not set"}</p>
          <p className="text-xs text-faint">Only you can see this. To correct it, contact the VYBR8 team.</p>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4">
          <span>
            <span className="block font-semibold">Birthday alerts</span>
            <span className="block text-xs text-faint">A heads-up a week before, and a happy birthday on the day, with the perks you can use.</span>
          </span>
          <input type="checkbox" name="birthday_alerts" defaultChecked={birthdayAlerts} className="size-6 accent-[var(--color-coral)]" />
        </label>
      </fieldset>

      <Button type="submit" className="self-start">Save changes</Button>
      <p className="text-sm text-muted">Need a hand? <Link href="/help" className="font-semibold text-sky hover:underline">Help &amp; Support</Link></p>
    </form>
  );
}
