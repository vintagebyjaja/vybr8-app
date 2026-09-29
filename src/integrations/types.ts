/**
 * Every external integration returns data tagged with where it came from and how fresh it is.
 * The UI uses `source.kind` to label demo data and `fetchedAt` to show freshness (spec §2, §34).
 */
export type DataSource =
  | { kind: "demo"; provider: string } // development mock: must be labeled in UI
  | { kind: "business"; provider: "vybr8" } // entered by a verified business
  | { kind: "provider"; provider: string } // official third-party API
  | { kind: "link"; provider: string }; // outbound link only, no live data

export type Sourced<T> = { data: T; source: DataSource; fetchedAt: Date };

export const demo = <T>(provider: string, data: T): Sourced<T> => ({
  data,
  source: { kind: "demo", provider },
  fetchedAt: new Date(),
});
