import { redirect } from "next/navigation";

export default function BusinessPricingPage() {
  redirect("/pricing?tab=business");
}
