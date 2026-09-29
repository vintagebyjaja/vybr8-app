"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toChat, type ChatMessage } from "@/server/linkups";

/** Guest invite actions. The link token is the guest's key; the database only stores its hash. */
const token = z.string().regex(/^[A-Za-z0-9-]{8,96}$/);

export type GuestState = { error?: string };

function friendly(message: string | undefined) {
  if (!message) return "Something went wrong. Try again.";
  if (/violates|syntax|permission denied/i.test(message)) return "That didn't go through. Try again.";
  return message.charAt(0).toUpperCase() + message.slice(1) + ".";
}

export async function guestAccept(t: string, _: GuestState, form: FormData): Promise<GuestState> {
  const tk = token.parse(t);
  const name = String(form.get("name") ?? "").trim();
  const birthdate = String(form.get("birthdate") ?? "");
  if (!name) return { error: "Enter your name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return { error: "Enter your birthday." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("guest_accept_invite", { p_token: tk, p_name: name.slice(0, 40), p_birthdate: birthdate });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/i/${tk}`);
  return {};
}

export async function guestDecline(t: string) {
  const tk = token.parse(t);
  const supabase = await createClient();
  await supabase.rpc("guest_decline_invite", { p_token: tk });
  revalidatePath(`/i/${tk}`);
}

export async function guestLoadChat(t: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("guest_messages", { p_token: token.parse(t) });
  return toChat(data);
}

export async function guestSendChat(t: string, body: string): Promise<string | null> {
  const text = body.trim().slice(0, 1000);
  if (!text) return null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("guest_send_message", { p_token: token.parse(t), p_body: text });
  return error ? friendly(error.message) : null;
}
