import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export const metadata = { title: "Verify it's you" };

const STATUS: Record<string, string> = {
  pending: "We're checking your ID and selfie. This usually takes a few minutes.",
  verified: "You're ID verified. Your badge shows on your profile and in Link Ups.",
  failed: "We couldn't verify you. You can try again with a clearer photo of your ID.",
  expired: "Your verification expired. Verify again to keep your badge.",
};

/**
 * Identity verification: a government ID plus a live selfie, checked by a verification partner.
 * VYBR8 only stores the result (verified or not); the partner holds the ID and face images.
 */
export default async function VerifyPage() {
  const viewer = await requireViewer("/verify");
  const supabase = await createClient();
  const { data } = await supabase.from("identity_verifications").select("status, verified_at").eq("user_id", viewer.id).maybeSingle();
  const status = (data?.status as string | undefined) ?? "unverified";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-extrabold">Verify it&rsquo;s <span className="vybe-text">you</span></h1>
        <p className="mt-2 text-muted">A quick ID + selfie check keeps VYBR8 real. Verified members get an ID-verified badge that shows on their profile and in Link Ups.</p>
      </header>

      {status !== "unverified" && <p className="rounded-xl border border-sky/40 bg-sky/10 p-4 text-sm">{STATUS[status]}</p>}

      <ol className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 text-sm">
        <li><b>1. Photo of your ID.</b> Driver&rsquo;s license, state ID or passport.</li>
        <li><b>2. A live selfie.</b> Our verification partner matches it to your ID and checks you&rsquo;re a real person.</li>
        <li><b>3. Done.</b> VYBR8 only keeps the result. Your ID and face images stay with our verification partner, and are never shown to other members.</li>
      </ol>

      {viewer.isAdult ? (
        <button disabled className="vybe-gradient min-h-12 rounded-full text-sm font-bold text-ink opacity-60">Verification opens soon</button>
      ) : (
        <p className="rounded-xl border border-line p-4 text-sm text-muted">ID verification is for members 18 and older.</p>
      )}
      <p className="text-xs text-faint">We&rsquo;re connecting our verification partner now. Your profile photo still needs to be a clear photo of you. <Link href="/profile/settings" className="text-sky">Update your photo</Link></p>
    </div>
  );
}
