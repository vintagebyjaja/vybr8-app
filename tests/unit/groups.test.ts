import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ageOn, allowed, parseList, suggestForGroup, type Candidate, type Taster } from "../../src/domain/groups/groups.ts";

const item = (id: string, name: string, biz: string, extra: Partial<Candidate> = {}): Candidate => ({
  id, name, description: null, dishType: null, category: "food", isAlcoholic: false, businessId: biz, businessName: biz, businessSlug: biz, avgScore: 9, ...extra,
});
const jack: Taster = { memberId: "j", name: "Jack", isKid: true, canDrink: false, likes: ["fries", "lemonade"], dislikes: ["spicy"], allergies: ["peanuts"], dietary: [] };
const mom: Taster = { memberId: "m", name: "Mom", isKid: false, canDrink: true, likes: ["wings", "martini"], dislikes: [], allergies: [], dietary: [] };

describe("groups", () => {
  it("parses lists", () => assert.deepEqual(parseList("Wings, Mac & cheese ,  wings, x"), ["wings", "mac & cheese"]));
  it("age for transfer", () => assert.equal(ageOn("2013-06-01", new Date("2026-05-31")), 12));
  it("kids never get alcohol", () => assert.equal(allowed(jack, item("1", "Lemonade Martini", "a", { isAlcoholic: true, category: "drink" })), false));
  it("allergies always win", () => assert.equal(allowed(jack, item("2", "Peanut Butter Fries", "a")), false));
  it("dislikes are respected", () => assert.equal(allowed(jack, item("3", "Spicy Fries", "a")), false));
  it("vegetarians get no meat", () => assert.equal(allowed({ ...mom, dietary: ["vegetarian"] }, item("4", "Hot Honey Wings", "a")), false));
  it("finds the place where everyone has a pick", () => {
    const items = [
      item("w", "Hot Honey Wings", "ember"), item("f", "House Fries", "ember"),
      item("t", "Birria Tacos", "truck"), item("l", "Strawberry Lemonade", "truck", { category: "drink" }),
    ];
    const [top] = suggestForGroup([jack, mom], items);
    assert.equal(top!.businessId, "ember");
    assert.equal(top!.covered, 2);
    assert.equal(top!.picks.find((p) => p.memberId === "j")!.item.id, "f");
  });
});
