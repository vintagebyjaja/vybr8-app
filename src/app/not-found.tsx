import type { Metadata } from "next";
import { Roast404 } from "@/components/errors/Roast404";

// Next.js answers with a real HTTP 404 for this page (missing URLs and notFound() records alike).
export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return <Roast404 />;
}
