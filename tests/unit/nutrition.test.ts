import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BANNED_FOOD_WORDS, compareCalories, makeItWork, scale, shareOf, vybeCheck } from "../../src/domain/nutrition/nutrition.ts";

const fries = { calories: 520, protein_g: 6, sodium_mg: 780 };
const targets = { goal: "weight_management", calories: 2000, protein_g: 140 };
const today = { calories: 1430, protein_g: 82, meals: 2 };

describe("food intelligence language", () => {
  it("explains share of target", () => assert.equal(shareOf(520, 2000), 26));
  it("vybe check uses the person's own targets", () => {
    const lines = vybeCheck(fries, targets, today);
    assert.ok(lines[0]!.includes("26%"));
    assert.ok(lines.some((l) => l.includes("82 / 140 g protein")));
  });
  it("says nothing without targets", () => assert.deepEqual(vybeCheck(fries, null, today), []));
  it("never uses shaming words", () => {
    const all = [...vybeCheck({ calories: 1500 }, targets, today), ...makeItWork("House Fries", fries, { fried: true, lowProteinToday: true })].join(" ").toLowerCase();
    for (const w of BANNED_FOOD_WORDS) assert.ok(!new RegExp(`\\b${w}\\b`).test(all), w);
  });
  it("make it work keeps the choice with the person", () => assert.ok(makeItWork("House Fries", fries).some((l) => l.startsWith("Keep the house fries"))));
  it("only compares calories when both are known", () => {
    assert.equal(compareCalories({ calories: 780, source: "estimated" }, { calories: 510, source: "restaurant_provided" }), "About 270 fewer calories");
    assert.equal(compareCalories({ calories: 780, source: "estimated" }, { calories: null, source: "unknown" }), null);
  });
  it("scales a split portion", () => assert.equal(scale(fries, 0.5).calories, 260));
});
