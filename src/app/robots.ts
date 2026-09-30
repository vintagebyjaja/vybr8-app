import type { MetadataRoute } from "next";
import { publicEnv } from "@/config/public-env";

/** Search engines may read VYBR8's public pages; private and team areas stay out of results. */
export default function robots(): MetadataRoute.Robots {
  const site = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/auth/", "/team", "/health", "/notifications", "/profile/settings", "/i/", "/welcome", "/business", "/food-truck/dashboard", "/chef/dashboard"] }],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
