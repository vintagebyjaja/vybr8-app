/**
 * Product analytics with a property allowlist. Health, dietary and free-text data never leave the app.
 */
const ALLOWED_PROPS = new Set(["surface", "category", "venue_kind", "filter", "result_count", "phase", "plan"]);

export type AnalyticsEvent =
  | "venue_viewed"
  | "item_viewed"
  | "item_rated"
  | "item_saved"
  | "linkup_created"
  | "group_vybe_run"
  | "chart_viewed"
  | "search_performed";

export interface Analytics {
  track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>): void;
}

export function scrub(props: Record<string, string | number | boolean> = {}) {
  return Object.fromEntries(Object.entries(props).filter(([k]) => ALLOWED_PROPS.has(k)));
}

export const noopAnalytics: Analytics = { track() {} };
export const consoleAnalytics: Analytics = {
  track(event, props) {
    console.info(JSON.stringify({ analytics: event, ...scrub(props) }));
  },
};
