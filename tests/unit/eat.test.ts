import { test } from "node:test";
import assert from "node:assert/strict";
import { EAT_TYPES, cuisineLabel, formatDistance, roundCoord } from "../../src/domain/places/eat.ts";

test("what-to-eat helpers", () => {
  assert.equal(cuisineLabel("soul_food"), "Soul food");
  assert.equal(formatDistance(50), "Right here");
  assert.equal(formatDistance(1609.344 * 2.34), "2.3 mi");
  assert.equal(formatDistance(1609.344 * 14.6), "15 mi");
  assert.equal(formatDistance(null), null);
  assert.equal(roundCoord(35.227089), 35.227);
  assert.ok(EAT_TYPES.find((t) => t.key === "coffee")?.kinds?.includes("tea_shop"));
});
