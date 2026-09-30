import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", weight: ["500", "600", "700", "800"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://vybr8.live").replace(/\/$/, "");
const TAGLINE = "Eat • Drink • Live • Connect";
const DESCRIPTION = "VYBR8 is where you find the best dish or drink near you, see what real people rate, and link up with friends. Eat, drink, live and connect in Charlotte, Atlanta, Nashville, Houston, Phoenix, DC, Brooklyn and Miami.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: `VYBR8 | ${TAGLINE}`, template: "%s · VYBR8" },
  description: DESCRIPTION,
  applicationName: "VYBR8",
  keywords: ["VYBR8", "restaurants near me", "best food", "drinks", "nightlife", "link up", "food ratings", "Black-owned restaurants", "Charlotte", "Atlanta", "Miami"],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website", siteName: "VYBR8", url: SITE, title: `VYBR8 | ${TAGLINE}`, description: DESCRIPTION,
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: `VYBR8. ${TAGLINE}.` }],
  },
  twitter: { card: "summary_large_image", title: `VYBR8 | ${TAGLINE}`, description: DESCRIPTION, images: ["/og.jpg"] },
  appleWebApp: { capable: true, title: "VYBR8", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png?v=4", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png?v=4", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png?v=4",
  },
};

export const viewport: Viewport = {
  themeColor: "#07060b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${manrope.variable}`}>
      <body className="min-h-dvh pt-[env(safe-area-inset-top)]">{children}</body>
    </html>
  );
}
