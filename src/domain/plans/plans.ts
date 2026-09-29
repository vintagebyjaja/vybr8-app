/**
 * Plan catalog for display (pricing page). Access decisions never read this file:
 * they come from the database (plan_entitlements) through src/server/entitlements.ts.
 */

export type Entitlement =
  // consumer
  | "ad_free" | "advanced_vybe_match" | "advanced_filters" | "advanced_nutrition" | "custom_nutrition_targets"
  | "advanced_group_vybe" | "deep_dive" | "goal_impact" | "make_it_work" | "better_swap" | "eating_it_anyway"
  | "meal_planning" | "weekly_reports"
  // business
  | "business_advanced_analytics" | "item_performance" | "rating_trends" | "ranking_movement" | "campaign_tools" | "promotion_management"
  | (string & {});

export type PlanCard = {
  code: string;
  name: string;
  monthly: number;      // dollars
  yearly?: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
  headline?: string;
};

export const CONSUMER_PLANS: PlanCard[] = [
  {
    code: "free", name: "Free", monthly: 0, tagline: "Everything you need to find what's good.",
    features: [
      "Restaurants, bars, lounges, hookah & cigar lounges", "Food trucks and where they are today", "Chef discovery and profiles",
      "Menus and individual food & drink ratings", "Service Vybe and Aesthetic ratings", "VYBR8 Charts", "Friends, Taste profile, Saves and Want to Try",
      "Link Ups and basic Group Vybe with budget matching", "Big Back Mode", "Basic food logging and nutrition overview",
    ],
  },
  {
    code: "plus", name: "VYBR8+", monthly: 6.99, yearly: 49.99, tagline: "Smarter matching, no ads, detailed nutrition.",
    features: [
      "Everything in Free", "No ads", "Advanced Vybe Match and discovery filters", "Advanced Taste Profile and deeper friend Taste Match",
      "Advanced Group Vybe with expanded explanations", "Advanced menu matching", "Detailed nutrition and custom targets (protein, carbs, fat, optional sodium, sugar, fiber)",
      "Weekly nutrition insights and meal history", "Nutrition-aware recommendations", "Expanded Active Vybe", "Advanced saved-item organization",
    ],
  },
  {
    code: "max", name: "VYBR8 MAX", monthly: 9.99, yearly: 79.99, highlight: true,
    headline: "KNOW YOUR FOOD. KNOW YOUR VYBE.",
    tagline: "Go deeper into ingredients, preparation, chefs, nutrition and how your choices fit your goals, without giving up the food you love.",
    features: [
      "Everything in VYBR8+", "DEEP DIVE on every eligible dish", "What's in it, how it's made, and where that info came from",
      "From the Kitchen and the chef behind the dish", "Goal Impact and YOUR VYBE CHECK", "MAKE IT WORK, BETTER SWAP and I'M EATING IT ANYWAY",
      "Advanced Active Vybe and daily planning", "Adaptive meal planning, restaurant vs home", "Advanced weekly reports and smart substitutions",
      "AI-assisted food intelligence where it helps",
    ],
  },
];

export const BUSINESS_PLANS: PlanCard[] = [
  {
    code: "business_free", name: "Free", monthly: 0, tagline: "Claim your place and run your menu.",
    features: [
      "Claim your business and a verified profile", "Hours, location and description", "Menu and item management with prices", "Photos, delivery and reservation links",
      "Food-truck schedule management", "Public ratings and rankings", "Basic review responses", "Basic analytics",
    ],
  },
  {
    code: "business_pro", name: "Pro", monthly: 49, highlight: true, tagline: "See what's working on your menu.",
    features: [
      "Everything in Free", "Advanced analytics and a performance dashboard", "Item and menu performance", "Rating trends and ranking movement",
      "Customer-interest trends, saves and Want-to-Try", "Group Vybe and budget-exclusion insights (aggregated)", "Shareable ranking graphics",
    ],
  },
  {
    code: "business_growth", name: "Growth", monthly: 99, tagline: "Campaigns, specials and deeper trends.",
    features: [
      "Everything in Pro", "Category analytics", "Campaign tools and promotional management", "Multiple active specials",
      "Advanced customer trend insights", "Enhanced menu performance tools", "Multi-location ready",
    ],
  },
];

export const PAID_PLACEMENT_RULES = [
  "Payment never changes a VYBR8 score.",
  "Payment never changes organic chart rank.",
  "Every paid placement is labeled Promoted or Sponsored.",
];

export function formatPrice(dollars: number): string {
  return dollars === 0 ? "$0" : `$${dollars.toFixed(2).replace(/\.00$/, "")}`;
}
