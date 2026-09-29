/**
 * Plates, Pours and Spots: photo posts about food, drinks and places.
 * Pure rules shared by the composer (client) and the create-post action (server),
 * so the same limits apply on both sides. The database enforces them again.
 */

export const POST_KINDS = {
  plate: { label: "Plate", noun: "dish", prompt: "Post your plate" },
  pour: { label: "Pour", noun: "drink", prompt: "Post your pour" },
  spot: { label: "Spot", noun: "place", prompt: "Post the spot" },
} as const;
export type PostKind = keyof typeof POST_KINDS;

export const CREATOR_TYPES = {
  big_back: { label: "Big Back", blurb: "Food creator" },
  liquid_lover: { label: "Liquid Lover", blurb: "Drink creator" },
  both: { label: "Big Back + Liquid Lover", blurb: "Food and drink creator" },
} as const;
export type CreatorType = keyof typeof CREATOR_TYPES;

export const POST_LIMITS = {
  minPhotos: 1,
  maxPhotos: 10,
  captionMax: 2200,
  itemNameMax: 120,
  altTextMax: 300,
  maxPriceCents: 10_000_000,
  /** Longest edge after client-side resizing. Keeps uploads fast on mobile data. */
  maxImageEdge: 1600,
  maxUploadBytes: 10 * 1024 * 1024,
  allowedTypes: ["image/jpeg", "image/png", "image/webp"] as readonly string[],
} as const;

export type PostPhoto = { path: string; width: number; height: number; altText?: string };

export type PostDraft = {
  kind: string;
  businessId?: string | null;
  itemName?: string | null;
  caption?: string | null;
  rating?: number | null;
  priceCents?: number | null;
  visibility?: string;
  /** Drinks only. Alcohol posts are 21+ (checked again on the server and in the database). */
  isAlcoholic?: boolean;
  photos: readonly PostPhoto[];
};

export type ValidPost = {
  kind: PostKind;
  businessId: string | null;
  itemName: string | null;
  caption: string | null;
  rating: number | null;
  priceCents: number | null;
  visibility: "public" | "friends" | "private";
  isAlcoholic: boolean;
  photos: PostPhoto[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE = /^[A-Za-z0-9._-]{1,120}$/;

/** A storage path is only acceptable if it sits directly in the uploader's own folder. */
export function isOwnStoragePath(userId: string, path: string): boolean {
  const [folder, file, ...rest] = path.split("/");
  return rest.length === 0 && folder === userId && UUID.test(userId) && !!file && FILE.test(file);
}

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

export function validatePostDraft(
  userId: string,
  draft: PostDraft,
): { ok: true; value: ValidPost } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!(draft.kind in POST_KINDS)) errors.push("Choose Plate, Pour or Spot.");

  const photos = [...draft.photos];
  if (photos.length < POST_LIMITS.minPhotos) errors.push("Add at least one photo.");
  if (photos.length > POST_LIMITS.maxPhotos) errors.push(`Add up to ${POST_LIMITS.maxPhotos} photos.`);
  if (photos.some((p) => !isOwnStoragePath(userId, p.path))) errors.push("One of the photos didn't upload correctly. Try adding it again.");
  if (photos.some((p) => !Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width < 1 || p.height < 1))
    errors.push("One of the photos is missing its size.");
  if (photos.some((p) => (p.altText?.length ?? 0) > POST_LIMITS.altTextMax)) errors.push("Photo descriptions can be up to 300 characters.");

  const caption = clean(draft.caption);
  if (caption && caption.length > POST_LIMITS.captionMax) errors.push(`Captions can be up to ${POST_LIMITS.captionMax} characters.`);

  const itemName = clean(draft.itemName);
  if (itemName && itemName.length > POST_LIMITS.itemNameMax) errors.push("That dish or drink name is too long.");

  let rating: number | null = null;
  if (draft.rating !== null && draft.rating !== undefined) {
    if (!Number.isFinite(draft.rating) || draft.rating < 0 || draft.rating > 10) errors.push("Ratings go from 0 to 10.");
    else rating = Math.round(draft.rating * 10) / 10;
  }

  let priceCents: number | null = null;
  if (draft.priceCents !== null && draft.priceCents !== undefined) {
    if (!Number.isInteger(draft.priceCents) || draft.priceCents < 0 || draft.priceCents > POST_LIMITS.maxPriceCents)
      errors.push("Enter a valid price.");
    else priceCents = draft.priceCents;
  }

  const visibility = draft.visibility ?? "public";
  if (visibility !== "public" && visibility !== "friends" && visibility !== "private") errors.push("Choose who can see this post.");

  const businessId = clean(draft.businessId);
  if (businessId && !UUID.test(businessId)) errors.push("Pick the place from the list.");
  if (draft.kind === "spot" && !businessId) errors.push("Tag the place for a Spot post.");
  if (draft.isAlcoholic && draft.kind !== "pour") errors.push("Only drink posts can be marked as alcohol.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: draft.kind as PostKind,
      businessId,
      itemName,
      caption,
      rating,
      priceCents,
      visibility: visibility as ValidPost["visibility"],
      isAlcoholic: draft.kind === "pour" && !!draft.isAlcoholic,
      photos: photos.map((p) => ({ ...p, altText: p.altText?.trim() || undefined })),
    },
  };
}

/** Target size for client-side resizing: fit within `maxEdge`, never upscale. */
export function fitWithin(width: number, height: number, maxEdge: number = POST_LIMITS.maxImageEdge) {
  if (width <= 0 || height <= 0) throw new Error("Image has no size");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Parses "$16.99", "16.99" or "16" into cents. Returns null for empty input, NaN for junk. */
export function parsePriceToCents(input: string | null | undefined): number | null {
  const t = (input ?? "").replace(/[$,\s]/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return Number.NaN;
  const [dollars = "0", cents = ""] = t.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}

export function formatPrice(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** "9.4", "10", or null. */
export function formatRating(r: number | string | null | undefined): string | null {
  if (r === null || r === undefined || r === "") return null;
  const n = typeof r === "string" ? Number(r) : r;
  return Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(n === 10 ? 0 : 1) : null;
}

/** Short relative time for feeds: "now", "5m", "3h", "2d", then a date. */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
