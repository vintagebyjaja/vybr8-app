import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSearch } from "../../src/domain/search/intent.ts";

describe("unified search", () => {
  it("best wings near me → food, wing", () => {
    const p = parseSearch("Best wings near me");
    assert.equal(p.tab, "food");
    assert.deepEqual(p.terms, ["wing"]);
  });
  it("private chef for a birthday → chefs", () => {
    const p = parseSearch("Private chef for a birthday");
    assert.equal(p.tab, "chefs");
    assert.equal(p.service, "private_chef");
    assert.equal(p.occasion, "birthday");
  });
  it("food trucks open tonight → trucks, open now", () => {
    const p = parseSearch("Food trucks open tonight");
    assert.equal(p.tab, "trucks");
    assert.equal(p.openNow, true);
  });
  it("chef that caters → chefs, catering", () => assert.equal(parseSearch("Chef that caters").service, "catering"));
  it("best espresso martini → drinks", () => {
    const p = parseSearch("Best espresso martini");
    assert.equal(p.tab, "drinks");
    assert.deepEqual(p.terms, ["espresso", "martini"]);
  });
  it("hookah lounge with good food → nightlife", () => assert.equal(parseSearch("Hookah lounge with good food").tab, "nightlife"));
  it("caterer 50 guests under $500 → numbers parsed", () => {
    const p = parseSearch("Caterer 50 guests southern food under $500");
    assert.equal(p.guests, 50);
    assert.equal(p.maxBudget, 500);
    assert.deepEqual(p.terms, ["southern"]);
  });
  it("a chosen tab wins", () => assert.equal(parseSearch("wings", "drinks").tab, "drinks"));
});
