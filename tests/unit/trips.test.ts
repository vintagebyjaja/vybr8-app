import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMinutes, grooveGuideUrl, leaveBy, leaveByLabel, milesBetween } from "../../src/domain/trips/trips.ts";

test("Groove Guide links use coordinates when we have them, otherwise the address", () => {
  const a = grooveGuideUrl({ name: "Moo & Brew", lat: 35.2, lng: -80.85, address: "1300 S Blvd, Charlotte" })!;
  assert.match(a, /^https:\/\/grooveville\.org\/guide\/navigate\?to=35\.200000%2C-80\.850000&name=Moo\+%26\+Brew/);
  const b = grooveGuideUrl({ name: "The park", lat: null, lng: null, address: "Freedom Park" })!;
  assert.match(b, /q=The\+park%2C\+Freedom\+Park/);
});

test("distance and time formatting", () => {
  assert.ok(Math.abs(milesBetween({ lat: 35.2271, lng: -80.8431 }, { lat: 33.749, lng: -84.388 }) - 226) < 5);   // Charlotte → Atlanta
  assert.equal(formatMinutes(75), "1 hr 15 min");
  assert.equal(formatMinutes(0.2), "1 min");
});

test("leave-by time includes a parking buffer for driving", () => {
  const start = new Date("2026-10-22T23:00:00Z");
  const now = new Date("2026-10-22T21:00:00Z");
  const l = leaveBy(start, 25, "drive", now)!;
  assert.equal(l.at.toISOString(), "2026-10-22T22:30:00.000Z");
  assert.equal(leaveByLabel(l, "America/New_York"), "Leave by 6:30 PM");
  const late = leaveBy(start, 25, "drive", new Date("2026-10-22T22:40:00Z"))!;
  assert.equal(leaveByLabel(late, "America/New_York"), "Running 10 min late");
  assert.equal(leaveBy(start, 25, "drive", new Date("2026-10-23T01:00:00Z")), null);
});
