import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_CHEF_REVIEWS, RELATIONSHIP_LABEL, SERVICE_LABELS, REVIEWABLE_SERVICES, canShowChefScores, formatDollars, isCurrent, matchesFilters,
  packagePrice, parseChefFilters, parseSpecialties, priceSummary, readNotice, readSocials, slugify, withinBudget, type ChefMatchable,
} from "../../src/domain/chefs/chefs.ts";

describe("labels", () => {
  it("names every chef service", () => {
    assert.equal(SERVICE_LABELS.private_chef, "Private chef");
    assert.equal(SERVICE_LABELS.food_truck, "Food truck");
    assert.equal(Object.keys(SERVICE_LABELS).length, 9);
  });
  it("says who confirmed a relationship", () => {
    assert.equal(RELATIONSHIP_LABEL.self_reported, "Self-reported");
    assert.equal(RELATIONSHIP_LABEL.business_confirmed, "Confirmed by the business");
    assert.equal(RELATIONSHIP_LABEL.admin_verified, "Verified by VYBR8");
    assert.equal(RELATIONSHIP_LABEL.provider, "From a trusted source");
  });
  it("restaurant chef work is not reviewable as a chef service", () => {
    assert.ok(!REVIEWABLE_SERVICES.includes("restaurant_chef"));
    assert.ok(REVIEWABLE_SERVICES.includes("catering"));
  });
});

describe("review thresholds", () => {
  it("needs 5 reviews to show scores", () => {
    assert.equal(MIN_CHEF_REVIEWS, 5);
    assert.equal(canShowChefScores(4), false);
    assert.equal(canShowChefScores(5), true);
  });
});

describe("prices are estimates", () => {
  it("formats dollars", () => {
    assert.equal(formatDollars(45000), "$450");
    assert.equal(formatDollars(1250), "$12.50");
    assert.equal(formatDollars(250000), "$2,500");
  });
  it("phrases every price as a 'from' estimate", () => {
    assert.deepEqual(priceSummary({ startingCents: 45000, perPersonCents: 6500, hourlyCents: 9000, customQuote: true }),
      ["From $450", "From $65/person", "From $90/hour", "Custom quotes"]);
    for (const s of priceSummary({ startingCents: 100, perPersonCents: 100, hourlyCents: 100, customQuote: false })) assert.match(s, /^From /);
  });
  it("is empty when nothing is listed", () => {
    assert.deepEqual(priceSummary({ startingCents: null, perPersonCents: null, hourlyCents: null, customQuote: false }), []);
  });
  it("words package prices", () => {
    assert.equal(packagePrice("per_person", 6500), "From $65 per person");
    assert.equal(packagePrice("hourly", 9000), "From $90 per hour");
    assert.equal(packagePrice("starting", 12000), "From $120");
    assert.equal(packagePrice("custom_quote", null), "Custom quote");
  });
});

describe("current vs former", () => {
  it("no end date is current", () => assert.equal(isCurrent(null, "2026-09-29"), true));
  it("ending today is still current", () => assert.equal(isCurrent("2026-09-29", "2026-09-29"), true));
  it("a past end date is former", () => assert.equal(isCurrent("2022-12-31", "2026-09-29"), false));
});

describe("slugs and specialties", () => {
  it("slugifies names to match the database check", () => {
    assert.equal(slugify("Chef Simone Reyes!"), "chef-simone-reyes");
    assert.equal(slugify("  José & Ana  "), "jose-and-ana");
    assert.equal(slugify("!!!"), "chef");
    assert.match(slugify("a".repeat(200)), /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it("parses comma-separated specialties", () => {
    assert.deepEqual(parseSpecialties("Soul Food, caribbean ,soul food, x,  Vegan  "), ["Soul Food", "caribbean", "Vegan"]);
    assert.equal(parseSpecialties(Array.from({ length: 20 }, (_, i) => `Cuisine ${i}`).join(",")).length, 12);
  });
  it("reads only https socials of known kinds", () => {
    assert.deepEqual(readSocials([{ kind: "instagram", url: "https://instagram.com/x" }, { kind: "myspace", url: "https://x" }, { kind: "tiktok", url: "http://x" }, "junk"]),
      [{ kind: "instagram", url: "https://instagram.com/x" }]);
    assert.deepEqual(readSocials(null), []);
  });
});

describe("directory filters", () => {
  it("reads the GET form", () => {
    const f = parseChefFilters({ city: "charlotte", service: "catering", cuisine: " Soul ", accepting: "1", maxBudget: "$500", guests: "12" }, ["charlotte"]);
    assert.deepEqual(f, { city: "charlotte", service: "catering", cuisine: "Soul", accepting: true, maxBudget: 500, guests: 12 });
  });
  it("ignores junk", () => {
    const f = parseChefFilters({ city: "paris", service: "wizard", cuisine: "x", accepting: "yes", maxBudget: "-4", guests: "abc" }, ["charlotte"]);
    assert.deepEqual(f, { city: null, service: null, cuisine: null, accepting: false, maxBudget: null, guests: null });
  });
  it("accepts URLSearchParams and arrays", () => {
    assert.equal(parseChefFilters(new URLSearchParams("service=meal_prep")).service, "meal_prep");
    assert.equal(parseChefFilters({ guests: ["8", "9"] }).guests, 8);
  });

  const simone: ChefMatchable = {
    citySlug: "charlotte", areaSlugs: ["charlotte"], services: ["private_chef", "catering"], specialties: ["Soul Food", "Caribbean"],
    accepting: true, minGuests: 2, maxGuests: 80, startingCents: 45000, perPersonCents: 6500, hourlyCents: 9000, customQuote: true,
  };
  const none = { city: null, service: null, cuisine: null, accepting: false, maxBudget: null, guests: null };

  it("matches city, service, cuisine and accepting", () => {
    assert.ok(matchesFilters(simone, { ...none, city: "charlotte", service: "catering", cuisine: "soul", accepting: true }));
    assert.ok(!matchesFilters(simone, { ...none, city: "atlanta" }));
    assert.ok(!matchesFilters(simone, { ...none, service: "classes" }));
    assert.ok(!matchesFilters({ ...simone, accepting: false }, { ...none, accepting: true }));
  });
  it("matches guest counts inside the chef's range", () => {
    assert.ok(matchesFilters(simone, { ...none, guests: 40 }));
    assert.ok(!matchesFilters(simone, { ...none, guests: 1 }));
    assert.ok(!matchesFilters(simone, { ...none, guests: 200 }));
  });
  it("compares the budget with the starting or per-person price", () => {
    assert.ok(withinBudget(simone, 450, null));
    assert.ok(withinBudget({ ...simone, startingCents: null }, 100, null));
    assert.ok(withinBudget({ ...simone, startingCents: null }, 650, 10));
    assert.ok(!withinBudget({ ...simone, startingCents: null }, 600, 10));
    assert.ok(!withinBudget({ startingCents: null, perPersonCents: null, hourlyCents: null, customQuote: true }, 10_000, null));
  });
});

describe("notices", () => {
  it("only known codes show", () => {
    assert.equal(readNotice("saved")?.ok, true);
    assert.equal(readNotice("<script>"), null);
    assert.equal(readNotice("toString"), null);
  });
});
