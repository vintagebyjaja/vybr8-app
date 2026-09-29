import Link from "next/link";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata = { title: "VYBR8 for Business" };

export default function BusinessHome() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-text">← Back to VYBR8</Link>
      <ComingSoon
        phase="Phase 7 · VYBR8 for Business"
        title="VYBR8 for Business"
        tagline="Claim your venue, keep your menu and prices current, and see how your dishes rank."
        points={["Verified claims reviewed by the VYBR8 team", "Menus, specials, happy hour, hours and photos", "Aggregate analytics that never expose individual customers", "Businesses cannot edit ratings or buy organic rank"]}
      />
    </main>
  );
}
