import { PostComposer } from "@/components/posts/PostComposer";
import type { PostKind } from "@/domain/posts/posts";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export const metadata = { title: "New post" };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ venue?: string; kind?: string }> }) {
  const viewer = await requireViewer("/post/new");
  const { venue, kind } = await searchParams;
  const supabase = await createClient();
  const { data: venues } = await supabase.from("businesses").select("id, name, slug").order("name").limit(500);
  const defaultVenueId = venues?.find((v) => v.slug === venue)?.id;
  const defaultKind = (["plate", "pour", "spot"].includes(kind ?? "") ? kind : "plate") as PostKind;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Post your <span className="vybe-text">vybe</span></h1>
        <p className="mt-1 text-muted">Share the plate, the pour, or the spot. It shows up on your profile, your friends&rsquo; timelines, and the place&rsquo;s page.</p>
      </header>
      <PostComposer userId={viewer.id} venues={(venues ?? []).map((v) => ({ id: v.id as string, name: v.name as string }))} defaultVenueId={defaultVenueId} defaultKind={defaultKind} canPostAlcohol={viewer.hasPourAccess} under21={!viewer.is21Plus} />
    </div>
  );
}
