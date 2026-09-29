"use server";

import { redirect } from "next/navigation";
import { isOldEnough, parseYmd, todayIn } from "@/domain/birthday/birthday";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";

export type BirthdayState = { error?: string };

export async function confirmBirthday(_prev: BirthdayState, form: FormData): Promise<BirthdayState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");
  const raw = String(form.get("birthdate") ?? "");
  const birth = parseYmd(raw);
  if (!birth) return { error: "Enter your birthday as a full date." };
  if (!isOldEnough(birth, todayIn())) {
    // Under 13: sign them out and keep nothing.
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/auth/too-young");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("user_birthdays").insert({ user_id: viewer.id, birthdate: raw });
  if (error && error.code !== "23505") return { error: "We couldn't save that. Try again." };
  redirect("/");
}
