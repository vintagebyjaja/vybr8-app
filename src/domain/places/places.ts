/** Places people can add, how owners and chefs prove a listing is theirs, and how franchise locations are named. */

export const PLACE_KINDS = [
  { key: "restaurant", label: "Restaurant" },
  { key: "cafe", label: "Coffee shop" },
  { key: "tea_shop", label: "Tea & matcha" },
  { key: "juice_bar", label: "Juice, smoothies & lemonade" },
  { key: "bakery", label: "Bakery & desserts" },
  { key: "bar", label: "Bar" },
  { key: "cocktail_lounge", label: "Cocktail lounge" },
  { key: "lounge", label: "Lounge" },
  { key: "brewery", label: "Brewery" },
  { key: "hookah_lounge", label: "Hookah lounge" },
  { key: "cigar_lounge", label: "Cigar lounge" },
  { key: "nightlife", label: "Nightlife" },
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number]["key"];
export const PLACE_KIND_KEYS = PLACE_KINDS.map((k) => k.key) as PlaceKind[];

export type ClaimMethod = "business_email" | "business_phone" | "document" | "google_profile" | "social";

/** How an owner proves a place is theirs. `steps` tells them what happens next with their proof code. */
export const CLAIM_METHODS: { key: ClaimMethod; label: string; hint: string; steps: (code: string) => string }[] = [
  {
    key: "business_email",
    label: "Business email",
    hint: "An email at the place's own website domain (like you@yourrestaurant.com) is the fastest.",
    steps: (code) => `We'll email the address you gave. Reply from it with your code ${code}.`,
  },
  {
    key: "business_phone",
    label: "Call the business line",
    hint: "The public phone number listed for this location.",
    steps: (code) => `The VYBR8 Team will call the business line. Whoever answers confirms you and reads back ${code}.`,
  },
  {
    key: "google_profile",
    label: "Google Business Profile",
    hint: "If you manage this location on Google.",
    steps: (code) => `Add ${code} to your Google Business Profile description (or post it as an update), then we check it.`,
  },
  {
    key: "social",
    label: "The place's Instagram, TikTok or website",
    hint: "An official account that lists this address.",
    steps: (code) => `Put ${code} in the bio or a story/post, or on the website. You can remove it after we approve you.`,
  },
  {
    key: "document",
    label: "Upload a document",
    hint: "Business license, food permit, liquor license or a utility bill showing the business name and this address. Only the VYBR8 Team sees it.",
    steps: (code) => `We'll review your document. Keep ${code} handy in case we contact you.`,
  },
];

export type ChefClaimMethod = "social" | "business_confirmation" | "license_or_certificate" | "document";
export const CHEF_CLAIM_METHODS: { key: ChefClaimMethod; label: string; hint: string }[] = [
  { key: "social", label: "My Instagram, TikTok or YouTube", hint: "Put your code in your bio, then paste the link below." },
  { key: "business_confirmation", label: "The restaurant can confirm me", hint: "Name the restaurant or venue; we'll check with them." },
  { key: "license_or_certificate", label: "Culinary license or certificate", hint: "ServSafe, culinary school, or a food business license with your name." },
  { key: "document", label: "Other document", hint: "Anything that shows this is you. Only the VYBR8 Team sees it." },
];

/** "Chick-fil-A · South Blvd" when a place has a branch; just the name otherwise. */
export function placeTitle(name: string, branch: string | null | undefined): string {
  return branch ? `${name} · ${branch}` : name;
}

/** Street name from an address line, e.g. "1200 South Blvd, Ste 4" → "South Blvd". Mirrors private.street_name in the database. */
export function streetName(address: string): string | null {
  const first = address.split(",")[0] ?? "";
  const s = first.replace(/^\s*[0-9][0-9A-Za-z-]*\s+/, "").trim();
  return s || null;
}
