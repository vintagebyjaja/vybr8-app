import { PostComposer } from "@/components/posts/PostComposer";
import type { PostKind } from "@/domain/posts/posts";
import { requireViewer } from "@/server/auth";
import { getPickedPlace } from "@/server/places";

export const metadata = { title: "New post" };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ venue?: string; kind?: string }> }) {
  const viewer = await requireViewer("/post/new");
  const { venue, kind } = await searchParams;
  const defaultVenue = await getPickedPlace({ slug: venue });
  const defaultKind = (["plate", "pour", "spot"].includes(kind ?? "") ? kind : "plate") as PostKind;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Post your <span className="vybe-text">vybe</span></h1>
        <p className="mt-1 text-muted">Share the plate, the pour, or the spot. It shows up on your profile, your friends&rsquo; timelines, and the place&rsquo;s page.</p>
      </header>
      <PostComposer userId={viewer.id} defaultVenue={defaultVenue} defaultKind={defaultKind} canPostAlcohol={viewer.hasPourAccess} under21={!viewer.is21Plus} />
    </div>
  );
}
