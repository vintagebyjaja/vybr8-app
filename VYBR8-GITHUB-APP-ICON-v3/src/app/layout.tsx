import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", weight: ["500", "600", "700", "800"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: { default: "VYBR8 · Eat • Drink • Link Up", template: "%s · VYBR8" },
  description: "Find the best actual dish or drink near you, and a spot your whole crew can enjoy tonight.",
  applicationName: "VYBR8",
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
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
