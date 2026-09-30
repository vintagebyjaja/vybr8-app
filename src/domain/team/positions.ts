/**
 * VYBR8 Team positions. The position decides the access level:
 * everyone is an Admin except Ambassadors, who are Moderators (fewer permissions).
 */
export const TEAM_POSITIONS = [
  { key: "city_director", label: "City Director", line: "Head of the entire city market", role: "admin" },
  { key: "community_lead", label: "Community Lead", line: "Local users, events, partnerships, outreach", role: "admin" },
  { key: "business_lead", label: "Business Lead", line: "Restaurants, bars, lounges, food trucks", role: "admin" },
  { key: "chef_relations", label: "Chef Relations", line: "Chefs, caterers, private chefs", role: "admin" },
  { key: "ambassador", label: "VYBR8 Ambassador", line: "Street team, creators, promotional representatives", role: "moderator" },
] as const;
export type TeamPosition = (typeof TEAM_POSITIONS)[number]["key"];
export const isTeamPosition = (k: unknown): k is TeamPosition => TEAM_POSITIONS.some((p) => p.key === k);
export const positionInfo = (k: TeamPosition) => TEAM_POSITIONS.find((p) => p.key === k)!;

/** Badge title: "Charlotte City Director", or just "VYBR8 Ambassador" when no city is picked. */
export function teamTitle(position: TeamPosition, cityName: string | null): string {
  const label = positionInfo(position).label;
  return (cityName ? `${cityName} ${label}` : label).slice(0, 60);
}
