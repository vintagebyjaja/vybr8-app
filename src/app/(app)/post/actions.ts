"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { validatePostDraft, type PostDraft } from "@/domain/posts/posts";
import { createClient } from "@/lib/supabase/server";
import { getViewer, requireViewer } from "@/server/auth";
import { log } from "@/server/log";

export type CreatePostResult = { error: string } | { ok: true; postId: string };

/**
 * Photos are uploaded straight from the browser to the viewer's own storage folder
 * (storage RLS enforces the folder). This action then validates the draft with the
 * same rules as the composer and creates the post, again under RLS.
 */
export async function createPost(draft: PostDraft): Promise<CreatePostResult> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in to post." };

  const result = validatePostDraft(viewer.id, draft);
  if (!result.ok) return { error: result.errors[0] ?? "Check your post and try again." };
  const v = result.value;
  if (v.isAlcoholic && !viewer.hasPourAccess) return { error: "Alcohol posts open up 5 days before your 21st birthday." };

  const supabase = await createClient();
  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      kind: v.kind,
      business_id: v.businessId,
      item_name: v.itemName,
      caption: v.caption,
      rating: v.rating,
      price_cents: v.priceCents,
      visibility: v.visibility,
      is_alcoholic: v.isAlcoholic,
    })
    .select("id")
    .single();
  if (error || !post) {
    log.warn("posts.create_failed", { code: error?.code });
    return { error: "We couldn't save your post. Try again." };
  }

  const { error: mediaError } = await supabase.from("post_media").insert(
    v.photos.map((p, i) => ({
      post_id: post.id,
      storage_path: p.path,
      position: i,
      width: p.width,
      height: p.height,
      alt_text: p.altText ?? null,
    })),
  );
  if (mediaError) {
    // Don't leave a photo-less post behind.
    await supabase.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", post.id);
    log.warn("posts.media_failed", { code: mediaError.code });
    return { error: "Your photos didn't attach. Try posting again." };
  }

  revalidatePath("/");
  revalidatePath("/explore");
  return { ok: true, postId: post.id as string };
}

export async function toggleVybe(postId: string) {
  const viewer = await requireViewer(`/post/${postId}`);
  if (!z.uuid().safeParse(postId).success) return;
  const supabase = await createClient();
  const { data: existing } = await supabase.from("post_vybes").select("post_id").eq("post_id", postId).eq("user_id", viewer.id).maybeSingle();
  if (existing) await supabase.from("post_vybes").delete().eq("post_id", postId).eq("user_id", viewer.id);
  else await supabase.from("post_vybes").insert({ post_id: postId });
  revalidatePath(`/post/${postId}`);
}

const commentSchema = z.object({ postId: z.uuid(), body: z.string().trim().min(1).max(1000) });

export async function addComment(form: FormData) {
  const parsed = commentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  await requireViewer(`/post/${parsed.data.postId}`);
  const supabase = await createClient();
  await supabase.from("post_comments").insert({ post_id: parsed.data.postId, body: parsed.data.body });
  revalidatePath(`/post/${parsed.data.postId}`);
}

export async function deletePost(form: FormData) {
  const postId = z.uuid().parse(form.get("postId"));
  const viewer = await requireViewer(`/post/${postId}`);
  const supabase = await createClient();
  // RLS + the posts guard allow this only for the author (or VYBR8 staff).
  await supabase.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
  const { data: me } = await supabase.from("profiles").select("username").eq("id", viewer.id).single();
  revalidatePath("/");
  redirect(me ? `/profile/${me.username}` : "/");
}

const reportSchema = z.object({
  targetId: z.uuid(),
  targetType: z.enum(["post", "comment", "profile"]),
  reason: z.enum(["spam", "inappropriate", "harassment", "misleading", "underage_drinking", "not_food_or_drink", "other"]),
  note: z.string().trim().max(500).optional(),
});

export async function reportContent(form: FormData) {
  const parsed = reportSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  await requireViewer("/");
  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reason: parsed.data.reason,
    note: parsed.data.note || null,
  });
  // A duplicate open report from the same person is fine to ignore.
  if (error && error.code !== "23505") log.warn("reports.create_failed", { code: error.code });
  if (parsed.data.targetType === "post") redirect(`/post/${parsed.data.targetId}?reported=1`);
}
