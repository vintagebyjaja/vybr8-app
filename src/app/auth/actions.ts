"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/config/public-env";
import { MIN_AGE, isOldEnough, parseYmd, todayIn } from "@/domain/birthday/birthday";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/server/log";
import { safeNext } from "@/server/safe-redirect";

export type AuthState = { error?: string; message?: string };

const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

const signUpSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters"),
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.]{3,30}$/, "3–30 letters, numbers, dots or underscores"),
  displayName: z.string().trim().max(60).optional(),
  birthdate: z.string().min(1, "Enter your birthday"),
});

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    log.info("auth.sign_in_failed", { code: error.code });
    return { error: "That email and password don't match. Try again or reset your password." };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const birth = parseYmd(parsed.data.birthdate);
  if (!birth) return { error: "Enter your birthday as a full date." };
  if (!isOldEnough(birth, todayIn())) {
    // Nothing is stored for people under the minimum age.
    return { error: `VYBR8 is for people ${MIN_AGE} and older.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/profile/settings`,
      data: { username: parsed.data.username, display_name: parsed.data.displayName || parsed.data.username, birthdate: parsed.data.birthdate },
    },
  });
  if (error) {
    log.info("auth.sign_up_failed", { code: error.code });
    return { error: error.code === "weak_password" ? "Choose a stronger password." : "We couldn't create that account. Try a different email." };
  }
  if (!data.session) return { message: "Check your email to confirm your account, then come back to find your vybe." };
  redirect("/profile/settings?welcome=1");
}
