/**
 * Food intelligence language rules (VYBR8 MAX). Neutral, never shaming, always sourced.
 * VYBR8 gives wellness and nutrition information, not diagnosis or treatment.
 */

export type NutritionSource = "verified" | "restaurant_provided" | "database_provided" | "estimated" | "unknown";
export type RecipeLevel = "verified_recipe" | "verified_ingredients" | "preparation_info" | "vybr8_estimate" | "unknown";

export const NUTRITION_SOURCE_LABEL: Record<NutritionSource, string> = {
  verified: "VERIFIED",
  restaurant_provided: "RESTAURANT PROVIDED",
  database_provided: "DATABASE PROVIDED",
  estimated: "ESTIMATED",
  unknown: "UNKNOWN",
};

export const RECIPE_LEVEL_LABEL: Record<RecipeLevel, { title: string; line: string }> = {
  verified_recipe: { title: "VERIFIED RECIPE", line: "The restaurant or chef chose to share this recipe." },
  verified_ingredients: { title: "VERIFIED INGREDIENTS", line: "Ingredients come from the kitchen. The full recipe isn't shared." },
  preparation_info: { title: "PREPARATION INFORMATION", line: "The kitchen shared how it's made." },
  vybr8_estimate: { title: "VYBR8 ESTIMATE", line: "Our explanation from the public menu and general cooking knowledge. Not the restaurant's recipe." },
  unknown: { title: "UNKNOWN", line: "Not enough information yet." },
};

/** Words VYBR8 never uses about food. */
export const BANNED_FOOD_WORDS = ["bad", "cheat", "guilty", "junk", "sinful", "ruin"] as const;

export type Nutrients = { calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null; fiber_g?: number | null; sodium_mg?: number | null; sugar_g?: number | null };
export type Targets = Nutrients & { goal?: string | null };
export type DayTotals = Nutrients & { meals: number };

const round = (n: number) => Math.round(n);

/** Share of a daily target (0–100+), or null if either side is unknown. */
export function shareOf(value: number | null | undefined, target: number | null | undefined): number | null {
  if (value == null || !target) return null;
  return round((value / target) * 100);
}

/**
 * YOUR VYBE CHECK: how an item may fit the targets the person chose. Neutral language only,
 * and nothing is claimed about health outcomes from a single meal.
 */
export function vybeCheck(item: Nutrients, targets: Targets | null, today: DayTotals | null): string[] {
  const lines: string[] = [];
  if (!targets || !targets.calories) return lines;
  const cal = item.calories;
  if (cal != null) {
    const share = shareOf(cal, targets.calories)!;
    const remaining = targets.calories - (today?.calories ?? 0);
    lines.push(`About ${share}% of your ${targets.calories.toLocaleString()} kcal target.`);
    if (today && remaining > 0) {
      lines.push(cal > remaining
        ? `It's more than the ${remaining.toLocaleString()} kcal left in today's target.`
        : `You'd have about ${(remaining - cal).toLocaleString()} kcal left today after it.`);
    }
    if (targets.goal === "weight_management" && share >= 30) {
      lines.push("This choice is higher in calories than some alternatives and may use a larger portion of today's selected target.");
    }
  } else {
    lines.push("Calories for this item aren't known yet, so we can't show how it fits today.");
  }
  if (targets.protein_g && today && today.protein_g != null && today.protein_g < targets.protein_g) {
    lines.push(`You're at ${round(today.protein_g)} / ${targets.protein_g} g protein today.`);
  }
  if (targets.sodium_mg && item.sodium_mg != null && shareOf(item.sodium_mg, targets.sodium_mg)! >= 40) {
    lines.push(`It's about ${shareOf(item.sodium_mg, targets.sodium_mg)}% of your sodium target.`);
  }
  return lines;
}

/** MAKE IT WORK: practical options. The person always decides. */
export function makeItWork(itemName: string, item: Nutrients, opts: { fried?: boolean; lowProteinToday?: boolean } = {}): string[] {
  const ideas = ["Choose a smaller portion", `Split the ${itemName.toLowerCase()}`];
  if (opts.lowProteinToday || (item.protein_g != null && item.protein_g < 15)) ideas.push("Pair it with a protein-rich entrée");
  if (opts.fried) ideas.push("Pick a non-fried side with it");
  ideas.push(`Keep the ${itemName.toLowerCase()} and adjust the rest of today's plan`);
  return ideas;
}

/**
 * Only call an alternative lighter when both calorie values are known (not "unknown") and it really is lower.
 * Never says "healthier".
 */
export function compareCalories(original: { calories: number | null; source: NutritionSource }, alt: { calories: number | null; source: NutritionSource }): string | null {
  if (original.calories == null || alt.calories == null || original.source === "unknown" || alt.source === "unknown") return null;
  const diff = original.calories - alt.calories;
  if (diff >= 50) return `About ${diff} fewer calories`;
  if (diff <= -50) return `About ${-diff} more calories`;
  return "Similar calories";
}

/** Apply a portion (e.g. 0.5 for "split it") to known nutrients. */
export function scale(n: Nutrients, portion: number): Nutrients {
  const s = (v: number | null | undefined) => (v == null ? null : Math.round(v * portion * 10) / 10);
  return { calories: n.calories == null ? null : Math.round(n.calories * portion), protein_g: s(n.protein_g), carbs_g: s(n.carbs_g), fat_g: s(n.fat_g), fiber_g: s(n.fiber_g), sodium_mg: n.sodium_mg == null ? null : Math.round(n.sodium_mg * portion), sugar_g: s(n.sugar_g) };
}
