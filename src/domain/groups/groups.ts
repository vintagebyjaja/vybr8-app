/** Groups: Family, Dating, Friends, Organizations, FTK (For The Kids). Pure rules + suggestions. */

export type GroupKind = "family" | "dating" | "friends" | "organization" | "ftk";
export type Relationship =
  | "partner" | "girlfriend" | "boyfriend" | "wife" | "husband" | "spouse" | "fiance" | "parent" | "child" | "sibling" | "grandparent"
  | "cousin" | "aunt_uncle" | "relative" | "friend" | "coworker" | "teammate" | "member" | "other";

export const GROUP_KINDS: Record<GroupKind, { label: string; line: string; max: number }> = {
  family: { label: "Family", line: "Partners, kids, siblings, parents. Plan family dinners and know what everyone likes.", max: 30 },
  dating: { label: "Dating", line: "Just the two of you. Pre-plan date nights with both your orders ready.", max: 2 },
  friends: { label: "Friends", line: "Your crew's go-to spots and orders.", max: 50 },
  organization: { label: "Organization", line: "Teams, clubs, churches, offices. Plan group meals.", max: 200 },
  ftk: { label: "FTK · For The Kids", line: "Kids' tastes and kid-friendly spots, shared with the adults who plan for them.", max: 50 },
};
export const GROUP_KIND_KEYS = Object.keys(GROUP_KINDS) as GroupKind[];

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  partner: "Partner", girlfriend: "Girlfriend", boyfriend: "Boyfriend", wife: "Wife", husband: "Husband", spouse: "Spouse", fiance: "Fiancé(e)",
  parent: "Parent", child: "Child", sibling: "Sibling", grandparent: "Grandparent", cousin: "Cousin", aunt_uncle: "Aunt / Uncle", relative: "Family",
  friend: "Friend", coworker: "Coworker", teammate: "Teammate", member: "Member", other: "Other",
};

/** Relationship choices that make sense for each kind of group. */
export const RELATIONSHIPS_FOR: Record<GroupKind, Relationship[]> = {
  family: ["wife", "husband", "spouse", "partner", "girlfriend", "boyfriend", "fiance", "child", "parent", "sibling", "grandparent", "cousin", "aunt_uncle", "relative"],
  dating: ["girlfriend", "boyfriend", "partner", "wife", "husband", "spouse", "fiance"],
  friends: ["friend", "other"],
  organization: ["member", "coworker", "teammate", "other"],
  ftk: ["child", "parent", "relative", "member", "other"],
};

export const TRANSFER_AGE = 13;

/** "wings, Mac & cheese ,  lemonade" → ["wings", "mac & cheese", "lemonade"] */
export function parseList(text: string | null | undefined, max = 30): string[] {
  return [...new Set((text ?? "").split(/[,\n]/).map((s) => s.trim().toLowerCase().replace(/\s+/g, " ")).filter((s) => s.length >= 2 && s.length <= 40))].slice(0, max);
}

export function ageOn(birthdate: string, today: Date = new Date()): number {
  const [y, m, d] = birthdate.split("-").map(Number) as [number, number, number];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

// ── Suggestions ("VYBR8, what should the family eat?") ─────────────────
export type Taster = { memberId: string; name: string; isKid: boolean; canDrink: boolean; likes: string[]; dislikes: string[]; allergies: string[]; dietary: string[]; kidsMenu?: boolean };
export type Candidate = { id: string; name: string; description: string | null; dishType: string | null; category: "food" | "drink"; isAlcoholic: boolean; businessId: string; businessName: string; businessSlug: string; avgScore: number | null; allergens?: string[] };
export type MemberPick = { memberId: string; name: string; item: Candidate; why: string };
export type PlaceSuggestion = { businessId: string; businessName: string; businessSlug: string; covered: number; total: number; picks: MemberPick[]; missing: string[] };

const MEAT = ["chicken", "beef", "pork", "bacon", "wing", "burger", "steak", "shrimp", "fish", "salmon", "birria", "sausage", "andouille", "meatball", "ham", "turkey", "lamb", "oxtail"];
const SEAFOOD = ["shrimp", "fish", "salmon", "crab", "lobster", "oyster", "whiting", "tuna"];

const text = (c: Candidate) => `${c.name} ${c.description ?? ""} ${c.dishType?.replace(/-/g, " ") ?? ""}`.toLowerCase();
const stem = (w: string) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const mentions = (hay: string, word: string) => hay.includes(stem(word.toLowerCase()));

/** Can this person have this item at all? Allergies and dislikes always win; kids never get alcohol. */
export function allowed(t: Taster, c: Candidate): boolean {
  if (c.isAlcoholic && (t.isKid || !t.canDrink)) return false;
  const hay = `${text(c)} ${(c.allergens ?? []).join(" ").toLowerCase()}`;
  if (t.allergies.some((a) => mentions(hay, a))) return false;
  if (t.dislikes.some((d) => mentions(hay, d))) return false;
  const diet = t.dietary.map((d) => d.toLowerCase());
  if (diet.some((d) => d.includes("vegetarian") || d.includes("vegan")) && MEAT.some((m) => hay.includes(m))) return false;
  if (diet.some((d) => d.includes("pescatarian")) && MEAT.filter((m) => !SEAFOOD.includes(m)).some((m) => hay.includes(m))) return false;
  if (diet.some((d) => d.includes("no pork") || d.includes("halal")) && /pork|bacon|ham\b|andouille/.test(hay)) return false;
  return true;
}

function bestFor(t: Taster, items: Candidate[]): MemberPick | null {
  let best: { c: Candidate; score: number; why: string } | null = null;
  for (const c of items) {
    if (!allowed(t, c)) continue;
    const liked = t.likes.find((l) => mentions(text(c), l));
    if (!liked && t.likes.length) continue;              // only suggest things they said they like
    const score = (liked ? 2 : 0) + (c.avgScore ?? 7) / 10 + (c.category === "food" ? 0.2 : 0);
    if (!best || score > best.score) best = { c, score, why: liked ? `likes ${liked}` : "top rated here" };
  }
  return best ? { memberId: t.memberId, name: t.name, item: best.c, why: best.why } : null;
}

/** Places where the most people have something they'll love. Ties go to higher-rated places. */
export function suggestForGroup(members: Taster[], items: Candidate[], limit = 5): PlaceSuggestion[] {
  const byPlace = new Map<string, Candidate[]>();
  for (const c of items) byPlace.set(c.businessId, [...(byPlace.get(c.businessId) ?? []), c]);
  const out: PlaceSuggestion[] = [];
  for (const [businessId, list] of byPlace) {
    const picks = members.map((m) => bestFor(m, list)).filter((p): p is MemberPick => !!p);
    if (!picks.length) continue;
    out.push({
      businessId, businessName: list[0]!.businessName, businessSlug: list[0]!.businessSlug,
      covered: picks.length, total: members.length, picks,
      missing: members.filter((m) => !picks.some((p) => p.memberId === m.memberId)).map((m) => m.name),
    });
  }
  const avg = (p: PlaceSuggestion) => p.picks.reduce((a, x) => a + (x.item.avgScore ?? 7), 0) / p.picks.length;
  return out.sort((a, b) => b.covered - a.covered || avg(b) - avg(a)).slice(0, limit);
}
