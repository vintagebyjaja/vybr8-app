import { test } from "node:test";
import assert from "node:assert/strict";
import { clock12, openStatus, weekSchedule } from "../../src/domain/map/hours.ts";

const week = (o: string, c: string) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: o, closesAt: c }));
// 2026-09-30 is a Wednesday. 16:00 UTC = 12 PM in New York.
const noonWed = new Date("2026-09-30T16:00:00Z");

test("clock", () => {
  assert.equal(clock12("17:00"), "5 PM");
  assert.equal(clock12("17:30:00"), "5:30 PM");
  assert.equal(clock12("00:00"), "12 AM");
  assert.equal(clock12("12:00"), "12 PM");
});

test("open now and closing time", () => {
  assert.deepEqual(openStatus(week("11:00", "22:00"), "America/New_York", noonWed), { open: true, line: "Open now · closes 10 PM" });
  assert.deepEqual(openStatus(week("00:00", "23:59"), "America/New_York", noonWed), { open: true, line: "Open now · 24 hours" });
});

test("closed and when it opens next", () => {
  assert.equal(openStatus(week("17:00", "02:00"), "America/New_York", noonWed)?.line, "Closed · opens 5 PM");
  const weekendsOnly = [{ weekday: 6, opensAt: "10:00", closesAt: "15:00" }];
  assert.equal(openStatus(weekendsOnly, "America/New_York", noonWed)?.line, "Closed · opens Sat 10 AM");
  const thursday = [{ weekday: 4, opensAt: "09:00", closesAt: "17:00" }];
  assert.equal(openStatus(thursday, "America/New_York", noonWed)?.line, "Closed · opens tomorrow 9 AM");
  assert.equal(openStatus([], "America/New_York", noonWed), null, "unknown hours say nothing");
});

test("late-night hours carry past midnight", () => {
  // 1 AM Thursday in New York, bar open Wed 5 PM – 2 AM.
  assert.equal(openStatus([{ weekday: 3, opensAt: "17:00", closesAt: "02:00" }], "America/New_York", new Date("2026-10-01T05:00:00Z"))?.open, true);
});

test("the week at a glance", () => {
  const w = weekSchedule([{ weekday: 1, opensAt: "11:00", closesAt: "14:00" }, { weekday: 1, opensAt: "17:00", closesAt: "22:00" }]);
  assert.equal(w[0]!.name, "Monday");
  assert.deepEqual(w[0]!.ranges, ["11 AM – 2 PM", "5 PM – 10 PM"]);
  assert.deepEqual(w[6]!.ranges, [], "Sunday closed");
});
