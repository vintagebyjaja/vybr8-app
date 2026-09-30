import { test } from "node:test";
import assert from "node:assert/strict";
import { cravingHeadline, parseCraving, parseSlugs, vybePercent, type CravingCategory } from "../../src/domain/cravezone/cravezone.ts";

const cat = (slug: string, name: string, emoji: string, keys: string[], terms: string[] = [], extra: Partial<CravingCategory> = {}): CravingCategory =>
  ({ slug, name, emoji, tone: "coral", indulgent: false, light: false, itemKeywords: keys, searchTerms: terms, ...extra });
const CATS: CravingCategory[] = [
  cat("chocolate", "Chocolate", "🍫", ["chocolate", "brownie"], ["chocolatey"]),
  cat("sweet", "Sweet", "🍰", ["dessert", "cake"], ["sweets", "sweet tooth"]),
  cat("salty", "Salty", "🍟", ["fries", "chips"], ["salt"]),
  cat("spicy", "Spicy", "🌶️", ["spicy", "hot", "jalapeno"], ["heat"]),
  cat("cheesy", "Cheesy", "🧀", ["cheese", "queso"]),
  cat("fruity", "Fruity", "🍓", ["strawberry", "mango"], ["fruits"]),
  cat("cold_refreshing", "Cold & Refreshing", "🧊", ["iced", "smoothie"], ["cold", "refreshing"]),
  cat("cookies", "Cookies", "🍪", ["cookie", "cookies"]),
  cat("ice_cream", "Ice Cream", "🍨", ["ice cream", "gelato"]),
];

test("reads everyday cravings", () => {
  assert.deepEqual(parseCraving("I want something chocolate.", CATS).include, ["chocolate"]);
  assert.deepEqual(parseCraving("I need fries.", CATS).include, ["salty"]);
  assert.deepEqual(parseCraving("Cookies and ice cream.", CATS).include.sort(), ["cookies", "ice_cream"]);
  assert.deepEqual(parseCraving("Something fruity and cold.", CATS).include.sort(), ["cold_refreshing", "fruity"]);
  assert.deepEqual(parseCraving("Something spicy and cheesy.", CATS).include.sort(), ["cheesy", "spicy"]);
  assert.deepEqual(parseCraving("I want something salty", CATS).include, ["salty"]);
});

test("understands 'not', 'light' and prices", () => {
  const p = parseCraving("Something sweet but not too heavy", CATS);
  assert.deepEqual(p.include, ["sweet"]);
  assert.equal(p.light, true);
  const q = parseCraving("cheesy but not spicy, under $15", CATS);
  assert.deepEqual(q.include, ["cheesy"]);
  assert.deepEqual(q.exclude, ["spicy"]);
  assert.equal(q.maxPriceCents, 1500);
  assert.equal(parseCraving("big back chocolate", CATS).big, true);
});

test("unknown words become a menu search", () => {
  const p = parseCraving("I need birria", CATS);
  assert.deepEqual(p.include, []);
  assert.equal(p.freeText, "birria");
  assert.equal(parseCraving("hot chips", CATS).freeText, null);
});

test("whole words only", () => {
  assert.deepEqual(parseCraving("hotel lobby snacks", CATS).include, [], "hotel is not hot");
});

test("% vybe favors what fits the craving", () => {
  const both = vybePercent({ wanted: 2, matchedCount: 2, matchWeight: 1.8, avgScore: 9.6, ratingCount: 20, meters: 1900 });
  const one = vybePercent({ wanted: 2, matchedCount: 1, matchWeight: 0.9, avgScore: 9.6, ratingCount: 20, meters: 1900 });
  assert.ok(both > one);
  assert.ok(both <= 99 && one >= 1);
  const allergic = vybePercent({ wanted: 1, matchedCount: 1, matchWeight: 0.9, avgScore: 9, ratingCount: 10, meters: 500, tasteMisses: 1 });
  const fine = vybePercent({ wanted: 1, matchedCount: 1, matchWeight: 0.9, avgScore: 9, ratingCount: 10, meters: 500 });
  assert.ok(allergic < fine, "things you avoid drop down");
});

test("URL helpers", () => {
  const known = new Set(CATS.map((c) => c.slug));
  assert.deepEqual(parseSlugs("sweet,chocolate,nope,sweet", known), ["sweet", "chocolate"]);
  assert.equal(cravingHeadline(["sweet", "chocolate"], CATS), "SWEET + CHOCOLATE 🍫");
});
