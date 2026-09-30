import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/config/public-env";
import { CITIES } from "@/domain/map/map";

export const revalidate = 86400; // rebuilt once a day

/** Public pages for search engines: the main pages, each city's lists, and every live place. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: `${site}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${site}/eat`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${site}/charts`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${site}/cravezone`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${site}/explore`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${site}/food-trucks`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${site}/chefs`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${site}/birthday`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${site}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    ...CITIES.flatMap((c) => [
      { url: `${site}/eat?city=${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 },
      { url: `${site}/charts?city=${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.6 },
    ]),
  ];
  try {
    // Public data only, read as a signed-out visitor.
    const supabase = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { data } = await supabase.from("businesses").select("slug, updated_at, kind").eq("status", "active").is("deleted_at", null).eq("is_demo", false).limit(20000);
    for (const b of (data ?? []) as { slug: string; updated_at: string; kind: string }[]) {
      pages.push({
        url: b.kind === "food_truck" ? `${site}/food-trucks/${b.slug}` : `${site}/venue/${b.slug}`,
        lastModified: new Date(b.updated_at), changeFrequency: "weekly", priority: 0.5,
      });
    }
  } catch {
    // Without the database the main pages are still listed.
  }
  return pages;
}
