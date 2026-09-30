"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { SUPPORT_TOPICS, type SupportTopic } from "@/domain/support/support";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { log } from "@/server/log";

const back = (params: Record<string, string>): never => redirect(`/help?${new URLSearchParams(params)}#contact`);

export async function sendSupport(form: FormData) {
  // A hidden field real people never fill in: bots do.
  if (String(form.get("website") ?? "").trim()) back({ sent: "1" });
  const topics = SUPPORT_TOPICS.map((t) => t.key) as [SupportTopic, ...SupportTopic[]];
  const p = z.object({
    email: z.email().max(254),
    name: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(80).optional()),
    topic: z.enum(topics),
    message: z.string().trim().min(10).max(2000),
    page: z.preprocess((v) => (typeof v === "string" && /^\/[^\s]{0,199}$/.test(v) ? v : undefined), z.string().optional()),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) {
    const field = p.error.issues[0]?.path[0];
    back({ e: field === "email" ? "Add an email we can answer you at." : field === "message" ? "Tell us a little more (at least 10 characters)." : "Pick what it's about." });
  }
  const d = p.data!;
  const viewer = await getViewer();
  const supabase = await createClient();
  const { error } = await supabase.from("support_tickets").insert({
    ...(viewer ? { user_id: viewer.id } : {}),
    email: d.email, name: d.name ?? null, topic: d.topic, message: d.message, page: d.page ?? null,
  });
  if (error) {
    log.warn("support.send_failed", { code: error.code });
    back({ e: error.message.includes("too many") ? "You've sent a few messages today. We'll get back to you soon, or email support@vybr8.live." : "That didn't send. Try again, or email support@vybr8.live." });
  }
  back({ sent: "1" });
}
