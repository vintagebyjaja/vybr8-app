import type { PerkWindow } from "./birthday.ts";

export type PerkType = "free_food" | "free_drink" | "discount" | "other";

export const PERK_TYPE_LABEL: Record<PerkType, string> = {
  free_food: "Free food",
  free_drink: "Free drink",
  discount: "Discount",
  other: "Birthday perk",
};

export type BirthdayPerk = {
  id: string;
  title: string;
  details: string | null;
  perkType: PerkType;
  window: PerkWindow;
  requirements: string | null;
  isAlcoholic: boolean;
  source: "business" | "community" | "vybr8";
  status: "pending" | "active" | "rejected" | "expired";
  lastConfirmedAt: string | null;
  isDemo: boolean;
  business: { id: string; slug: string; name: string; kind: string; city: string | null };
};
