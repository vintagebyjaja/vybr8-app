import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { daysBetween, hasPourAccess, isDrinkingAge, isOldEnough, nextBirthday, parseYmd, todayIn } from "@/domain/birthday/birthday";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  email: string | null;
  platformRoles: ("admin" | "moderator")[];
  /** "YYYY-MM-DD", or null if the person hasn't confirmed their birthday yet (e.g. social login). */
  birthdate: string | null;
  /** 21 or older: may see and post alcohol content, drink perks, and become a Liquid Lover. */
  is21Plus: boolean;
  /** May see and review alcohol posts and drink perks: 21+, or within 5 days of turning 21. */
  hasPourAccess: boolean;
  /** 18 or older: may see, host and join public and meet-new-friends Link Ups. */
  isAdult: boolean;
  /** Days until the 21st birthday while in the early-access window, else null. */
  daysUntil21: number | null;
};

export class AuthorizationError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * The verified signed-in user for this request, or null.
 * getClaims() verifies the JWT signature, unlike getSession() which only reads the cookie.
 * Roles are read from the database (RLS lets users read their own roles), never from client input.
 */
function ageFlags(birthdate: string | undefined): Pick<Viewer, "is21Plus" | "hasPourAccess" | "daysUntil21" | "isAdult"> {
  const b = birthdate ? parseYmd(birthdate) : null;
  if (!b) return { is21Plus: false, hasPourAccess: false, daysUntil21: null, isAdult: false };
  const today = todayIn();
  const is21Plus = isDrinkingAge(b, today);
  const early = hasPourAccess(b, today);
  return { isAdult: isOldEnough(b, today, 18), is21Plus, hasPourAccess: early, daysUntil21: early && !is21Plus ? daysBetween(today, nextBirthday(b, today)) : null };
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;

  const [{ data: roles }, { data: bday }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", sub),
    supabase.from("user_birthdays").select("birthdate").eq("user_id", sub).maybeSingle(),
  ]);
  return {
    id: sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    platformRoles: (roles ?? []).map((r) => r.role as Viewer["platformRoles"][number]),
    birthdate: (bday?.birthdate as string | undefined) ?? null,
    ...ageFlags(bday?.birthdate as string | undefined),
  };
});

/** For pages: send signed-out visitors to sign in and bring them back afterwards. */
export async function requireViewer(returnTo: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/auth/sign-in?next=${encodeURIComponent(returnTo)}`);
  return viewer;
}

/** For admin pages and actions. Hidden UI is never the security boundary. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer?.platformRoles.includes("admin")) throw new AuthorizationError("Admin access required");
  return viewer;
}

/** VYBR8 Team tools (creator verification, moderation): admins and moderators. */
export async function requireStaff(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer?.platformRoles.length) throw new AuthorizationError("VYBR8 team access required");
  return viewer;
}
