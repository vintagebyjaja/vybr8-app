"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { log } from "@/server/log";

/** Same rule as the database: an https Instagram, TikTok or YouTube profile link. */
const SOCIAL = /^https:\/\/(www\.|m\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\//i;

const url = z.url().refine((u) => u.startsWith("https://") || u.startsWith("http://"), "Links must start with https://");

const schema = z
  .object({
    creatorType: z.enum(["big_back", "liquid_lover", "both"]),
    city: z.string().trim().max(80).optional(),
    pitch: z.string().trim().min(20, "Tell us a bit more (at least 20 characters)").max(1000),
    instagram: url.or(z.literal("")).optional(),
    tiktok: url.or(z.literal("")).optional(),
    youtube: url.or(z.literal("")).optional(),
    is21: z.literal("on").optional(),
  })
  .refine((v) => v.creatorType === "big_back" || v.is21 === "on", { message: "Liquid Lovers must be 21 or older", path: ["is21"] })
  .refine((v) => [v.instagram, v.tiktok, v.youtube].some((u) => u && SOCIAL.test(u)), { message: "Add your Instagram, TikTok or YouTube link so we can verify you.", path: ["instagram"] });

export type ApplyState = { error?: string };

export async function applyForCreator(_prev: ApplyState, form: FormData): Promise<ApplyState> {
  const viewer = await requireViewer("/creators/apply");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const v = parsed.data;
  if (v.creatorType !== "big_back" && !viewer.is21Plus) return { error: "Liquid Lovers must be 21 or older. You can apply as a Big Back." };
  const links = [
    v.instagram && { platform: "Instagram", url: v.instagram },
    v.tiktok && { platform: "TikTok", url: v.tiktok },
    v.youtube && { platform: "YouTube", url: v.youtube },
  ].filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase.from("creator_applications").insert({
    creator_type: v.creatorType,
    city: v.city || null,
    pitch: v.pitch,
    links,
    is_21_plus_attested: v.is21 === "on",
  });
  if (error) {
    if (error.code === "23505") return { error: "You already have an application waiting for review." };
    log.warn("creators.apply_failed", { code: error.code });
    return { error: "We couldn't send your application. Try again." };
  }
  redirect("/creators/apply?sent=1");
}
