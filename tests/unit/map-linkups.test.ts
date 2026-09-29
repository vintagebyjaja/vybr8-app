import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CITIES, findCity, isOpenAt, project } from "../../src/domain/map/map.ts";
import { cityDay, is21OnDay, cityTimeToDate, spotsLeft, validateLinkupDraft, type LinkupDraft } from "../../src/domain/linkups/linkups.ts";

describe("cities", () => {
  it("launches with the 7 cities", () => {
    assert.deepEqual(CITIES.map((c) => c.slug), ["charlotte", "atlanta", "nashville", "houston", "phoenix", "dc", "brooklyn"]);
  });
  it("falls back to Charlotte for unknown cities", () => assert.equal(findCity("paris").slug, "charlotte"));
});

describe("map projection", () => {
  const b = findCity("charlotte").bounds;
  it("puts the city center near the middle", () => {
    const p = project(35.2271, -80.8431, b);
    assert.ok(p.x > 40 && p.x < 60 && p.y > 40 && p.y < 60);
  });
  it("keeps far-away pins inside the map", () => {
    const p = project(40, -70, b);
    assert.ok(p.x <= 94 && p.y >= 6);
  });
  it("north is up and east is right", () => {
    const north = project(35.35, -80.84, b), south = project(35.1, -80.84, b);
    const east = project(35.2, -80.7, b), west = project(35.2, -80.95, b);
    assert.ok(north.y < south.y && east.x > west.x);
  });
});

describe("open now", () => {
  const tz = "America/New_York";
  const at = (iso: string) => new Date(iso);
  const daily = (opensAt: string, closesAt: string) => Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt, closesAt }));
  it("open during normal hours, closed after", () => {
    assert.ok(isOpenAt(daily("11:00", "23:00"), tz, at("2026-10-02T18:00:00-04:00")));
    assert.ok(!isOpenAt(daily("11:00", "23:00"), tz, at("2026-10-02T23:30:00-04:00")));
  });
  it("handles places that close after midnight", () => {
    assert.ok(isOpenAt(daily("17:00", "02:00"), tz, at("2026-10-03T01:30:00-04:00")));
    assert.ok(!isOpenAt(daily("17:00", "02:00"), tz, at("2026-10-03T02:30:00-04:00")));
  });
  it("uses the place's own time zone", () => {
    // 9:30 PM in New York is 6:30 PM in Phoenix.
    assert.ok(isOpenAt(daily("11:00", "21:00"), "America/Phoenix", at("2026-10-02T21:30:00-04:00")));
  });
  it("no hours means we don't claim it's open", () => assert.ok(!isOpenAt([], tz)));
});

describe("Link Ups", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const base: LinkupDraft = {
    title: "Girls night out", occasion: "girls_night", citySlug: "charlotte", meetPoint: "South End",
    startsAt: new Date("2026-10-02T23:00:00Z"), endsAt: new Date("2026-10-03T03:00:00Z"),
    capacity: 6, visibility: "public", joinMode: "request", isAlcoholic: true,
  };
  const opts = { now, hostIs21OnDay: true, cities: CITIES.map((c) => c.slug) };
  it("accepts a valid girls night out", () => assert.deepEqual(validateLinkupDraft(base, opts), []));
  it("allows 2 to 10 spots only", () => {
    assert.ok(validateLinkupDraft({ ...base, capacity: 11 }, opts).length);
    assert.ok(validateLinkupDraft({ ...base, capacity: 1 }, opts).length);
    assert.deepEqual(validateLinkupDraft({ ...base, capacity: 10 }, opts), []);
  });
  it("drinks Link Ups need a 21+ host", () => assert.ok(validateLinkupDraft(base, { ...opts, hostIs21OnDay: false }).length));
  it("needs a place, a future start and an end after it", () => {
    assert.ok(validateLinkupDraft({ ...base, meetPoint: " " }, opts).length);
    assert.ok(validateLinkupDraft({ ...base, startsAt: new Date("2026-09-30T00:00:00Z") }, opts).length);
    assert.ok(validateLinkupDraft({ ...base, endsAt: base.startsAt }, opts).length);
  });
  it("counts spots left", () => {
    assert.equal(spotsLeft(6, 4), 2);
    assert.equal(spotsLeft(3, 5), 0);
  });
  it("reads times in the city's time zone, across daylight saving", () => {
    assert.equal(cityTimeToDate("2026-10-02T19:00", "America/New_York").toISOString(), "2026-10-02T23:00:00.000Z");
    assert.equal(cityTimeToDate("2026-12-02T19:00", "America/New_York").toISOString(), "2026-12-03T00:00:00.000Z");
    assert.equal(cityTimeToDate("2026-10-02T19:00", "America/Phoenix").toISOString(), "2026-10-03T02:00:00.000Z");
  });
});

describe("drinks Link Ups are judged on the event day", () => {
  it("21 on the day", () => assert.equal(is21OnDay("2005-10-05", "2026-10-05"), true));
  it("not yet 21 the day before", () => assert.equal(is21OnDay("2005-10-05", "2026-10-04"), false));
  it("uses the city's calendar day", () => assert.equal(cityDay(new Date("2026-10-05T03:00:00Z"), "America/Phoenix"), "2026-10-04"));
});
