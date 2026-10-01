import { test } from "node:test";
import assert from "node:assert/strict";
import { amountMultiplier, lookupFood } from "../../src/domain/health/food-table.ts";

test("a bowl of Fruity Pebbles gets an instant estimate", () => {
  const r = lookupFood({ name: "Fruity Pebbles", amount: "1 bowl" });
  assert.ok(r && r.calories > 250 && r.calories < 400);
});

test("amounts scale the estimate", () => {
  assert.equal(lookupFood({ name: "pizza", amount: "2 slices" })?.calories, 570);
  assert.equal(lookupFood({ name: "10 wings" })?.calories, 900);
  assert.equal(amountMultiplier("a big bowl"), 1.4);
  assert.equal(amountMultiplier("1/2 plate"), 0.5);
  assert.equal(amountMultiplier(null), 1);
});

test("the most specific match wins", () => {
  assert.equal(lookupFood({ name: "Egg sandwich" })?.matched, "egg sandwich");
  assert.equal(lookupFood({ name: "Diet Coke" })?.calories, 2);
  assert.equal(lookupFood({ name: "Unsweet tea" })?.calories, 2);
  assert.equal(lookupFood({ name: "pineapple" }), null);
});

test("drinks use ounces", () => {
  assert.equal(lookupFood({ name: "Sprite", ounces: 24 })?.calories, 300);
  assert.equal(lookupFood({ name: "margarita", ounces: 16 })?.calories, 600);
});

test("unknown foods fall through to the AI", () => {
  assert.equal(lookupFood({ name: "Grandma's special casserole" }), null);
});
