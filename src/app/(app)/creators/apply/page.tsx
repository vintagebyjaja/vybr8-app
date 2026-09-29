import Link from "next/link";
import { CreatorBadge } from "@/components/posts/Badges";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { ApplyForm } from "./ApplyForm";

export const metadata = { title: "Become a creator" };

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const viewer = await requireViewer("/creators/apply");
  const { sent } = await searchParams;
  const supabase = await createClient();
  const [{ data: creator }, { data: latest }] = await Promise.all([
    supabase.from("creator_profiles").select("creator_type, status").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("creator_applications").select("status, decision_note, proof_code, proof_confirmed_at").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">VYBR8 Creators</p>
        <h1 className="mt-2 text-3xl font-bold">Big Backs &amp; Liquid Lovers</h1>
        <p className="mt-2 text-muted">Verified creators get a badge, a spot on Explore, and their posts in everyone&rsquo;s Creators timeline. The VYBR8 team reviews every application.</p>
      </header>

      {creator?.status === "verified" ? (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-mint/40 p-4 text-sm">You&rsquo;re verified <CreatorBadge type={creator.creator_type} />. Keep posting!</p>
      ) : creator?.status === "suspended" ? (
        <p className="rounded-2xl border border-danger/40 p-4 text-sm text-danger">Your creator badge is paused. Contact the VYBR8 team for details.</p>
      ) : sent || latest?.status === "pending" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-sky/40 p-4 text-sm">
          <p className="font-semibold">Application sent. One more step so we know the account is really yours:</p>
          <p>
            Add this code to your Instagram, TikTok or YouTube bio (or a post caption) until you&rsquo;re verified:{" "}
            <code className="rounded bg-surface-2 px-2 py-1 font-bold text-orange">{(latest?.proof_code as string | undefined) ?? "…"}</code>
          </p>
          <p className="text-muted">
            {latest?.proof_confirmed_at ? "The team saw your code. You'll get your badge once they finish reviewing." : "The VYBR8 team checks the code, then reviews your posts. Your badge appears on your profile once you're verified."}
          </p>
        </div>
      ) : (
        <>
          {latest?.status === "rejected" && (
            <p className="rounded-2xl border border-line p-4 text-sm text-muted">Your last application wasn&rsquo;t approved{latest.decision_note ? `: ${latest.decision_note}` : "."} You can apply again.</p>
          )}
          <ApplyForm canBeLiquidLover={viewer.is21Plus} />
        </>
      )}
      <Link href="/explore" className="text-sm text-muted hover:text-text">← Back to Explore</Link>
    </div>
  );
}
