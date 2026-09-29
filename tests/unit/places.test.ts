import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_METHODS, PLACE_KIND_KEYS, placeTitle, streetName } from "../../src/domain/places/places.ts";

test("franchise locations are named by branch", () => {
  assert.equal(placeTitle("Chick-fil-A", "South Blvd"), "Chick-fil-A · South Blvd");
  assert.equal(placeTitle("Ember & Oak", null), "Ember & Oak");
});

test("street name comes from the address line", () => {
  assert.equal(streetName("1200 South Blvd"), "South Blvd");
  assert.equal(streetName("4400 Sharon Rd, Suite 12"), "Sharon Rd");
  assert.equal(streetName("12B Main St"), "Main St");
  assert.equal(streetName("   "), null);
});

test("food trucks are not added through the place form", () => {
  assert.ok(!(PLACE_KIND_KEYS as string[]).includes("food_truck"));
});

test("every claim method explains the next step with the code", () => {
  for (const m of CLAIM_METHODS) assert.match(m.steps("VYBR8-ABC123"), /VYBR8-ABC123/);
});
