import { test } from "node:test";
import assert from "node:assert/strict";
import { ROASTS, ROAST_HOME, nextRoast, roastKindFor } from "../../src/domain/errors/roasts.ts";

test("dead nightlife links get nightlife roasts; everything else is food", () => {
  assert.equal(roastKindFor("/bars/whatever"), "nightlife");
  assert.equal(roastKindFor("/Nightlife"), "nightlife");
  assert.equal(roastKindFor("/cocktails/lost"), "nightlife");
  assert.equal(roastKindFor("/search/oops", "?tab=nightlife"), "nightlife");
  assert.equal(roastKindFor("/menus/old"), "food");
  assert.equal(roastKindFor("/asdfgh"), "food");
  assert.equal(roastKindFor("/venue/barbecue-spot"), "food");   // "bar" only counts as a whole segment
  assert.equal(roastKindFor(null), "food");
});

test("Roast Me Again never repeats the one showing", () => {
  for (const kind of ["food", "nightlife"] as const) {
    for (let cur = 0; cur < ROASTS[kind].length; cur++) {
      for (const r of [0, 0.3, 0.6, 0.999]) assert.notEqual(nextRoast(kind, cur, () => r), cur);
    }
  }
});

test("message counts and real destinations", () => {
  assert.equal(ROASTS.food.length, 4);
  assert.equal(ROASTS.nightlife.length, 6);
  assert.equal(ROAST_HOME.food.href, "/eat");
  assert.equal(ROAST_HOME.nightlife.href, "/search?tab=nightlife");
});
