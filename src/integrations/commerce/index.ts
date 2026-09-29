import type { Sourced } from "../types";

/** Delivery (Uber Eats, DoorDash) and reservations (OpenTable). No scraping, ever. */
export type FulfillmentOption = {
  mode: "delivery" | "pickup" | "reservation";
  provider: "uber_eats" | "doordash" | "opentable" | "direct";
  url: string;
};

export interface FulfillmentProvider {
  readonly id: string;
  optionsForLocation(locationId: string): Promise<Sourced<FulfillmentOption[]>>;
}

/**
 * Link adapter: returns outbound links the verified business entered themselves.
 * Source is "link", so the UI says "Opens Uber Eats" and never claims live availability.
 */
export function linkFulfillmentProvider(
  load: (locationId: string) => Promise<{ options: FulfillmentOption[]; updatedAt: Date }>,
): FulfillmentProvider {
  return {
    id: "links",
    async optionsForLocation(locationId) {
      const { options, updatedAt } = await load(locationId);
      return { data: options, source: { kind: "link", provider: "business-entered" }, fetchedAt: updatedAt };
    },
  };
}
