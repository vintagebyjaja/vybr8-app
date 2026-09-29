import { ComingSoon } from "@/components/ui/ComingSoon";
import { requireViewer } from "@/server/auth";
export const metadata = { title: "Health" };
export default async function HealthPage() {
  await requireViewer("/health");
  return (
    <ComingSoon
      phase="Phase 8 · Health foundation"
      title="Eat what you love. Know what you're eating."
      tagline="Optional and private by default. Nothing here is ever required to use VYBR8."
      points={["Calories and macros, labeled verified, provider-supplied or estimated", "Meal logging and daily summaries against goals you set", "Active Vybe: activity as context for dinner ideas, not a calorie trade"]}
    />
  );
}
