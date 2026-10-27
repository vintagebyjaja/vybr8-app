import type { MetadataRoute } from "next";
import { publicEnv } from "@/config/public-env";

// AI-training and SEO crawlers that bring VYBR8 no visitors but use up server requests.
const BLOCKED_BOTS = ["GPTBot", "CCBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "Bytespider", "Amazonbot", "meta-externalagent",
  "PerplexityBot", "Applebot-Extended", "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "BLEXBot", "Barkrowler"];

/** Search engines may read VYBR8's public pages; private and team areas stay out of results. */
export default function robots(): MetadataRoute.Robots {
  const site = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return {
    rules: [
      { userAgent: BLOCKED_BOTS, disallow: "/" },
      { userAgent: "*", allow: "/", crawlDelay: 5, disallow: ["/admin", "/api/", "/auth/", "/team", "/health", "/notifications", "/profile/settings", "/i/", "/welcome", "/business", "/food-truck/dashboard", "/chef/dashboard"] },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
