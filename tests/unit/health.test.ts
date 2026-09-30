import { test } from "node:test";
import assert from "node:assert/strict";
import { FOOD_SLOTS, blockAt, blocksFor, bodyHour, dayPart, daysLabel, mostActive, vybeDay, addDays, formatClock, hourIn, slotForHour, slotIndex, gaugeDash, isYmd, mergeDay, milesFrom, recommendationsFor, versusAverage } from "../../src/domain/health/health.ts";

test("two sources for one day never double count", () => {
  const m = mergeDay([
    { day: "2026-09-30", steps: 8000, activeCalories: null, distanceM: 5000, activeMinutes: 40, source: "manual" },
    { day: "2026-09-30", steps: 12482, activeCalories: 612, distanceM: null, activeMinutes: 85, source: "apple_health" },
  ])!;
  assert.equal(m.steps, 12482);
  assert.equal(m.activeCalories, 612);
  assert.equal(m.distanceM, 5000);
  assert.deepEqual(m.sources, ["manual", "apple_health"]);
  assert.equal(mergeDay([]), null);
});

test("percent versus your own average needs a few days of history", () => {
  assert.equal(versusAverage(13200, [10000, 10000, 10000]), 32);
  assert.equal(versusAverage(5000, [10000, null, 10000, 10000]), -50);
  assert.equal(versusAverage(5000, [10000]), null);
});

test("recommendations follow activity against the goal", () => {
  assert.equal(recommendationsFor(12482, 10000, 85).dayType, "high_energy");
  assert.deepEqual(recommendationsFor(12482, 10000, 85).recs, ["protein", "carbs", "hydration", "nutrient"]);
  assert.equal(recommendationsFor(3000, 10000, 10).dayType, "rest");
  assert.equal(recommendationsFor(8000, 10000, 20).dayType, "custom");
  assert.equal(recommendationsFor(null, 10000, null).dayType, "custom");
});

test("helpers", () => {
  assert.equal(milesFrom(8690), 5.4);
  assert.equal(gaugeDash(2, 100).filled, Math.PI * 100);
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(isYmd("2026-02-30x"), false);
  assert.equal(formatClock("07:30:00"), "7:30 AM");
  assert.equal(formatClock("19:00"), "7:00 PM");
  assert.equal(formatClock("12:30"), "12:30 PM");
});

import { activityScore, dayAdvice, formatDuration, sleepMinutes } from "../../src/domain/health/health.ts";

test("sleep crosses midnight", () => {
  assert.equal(sleepMinutes("23:15", "07:05"), 470);
  assert.equal(sleepMinutes("01:00", "09:30"), 510);
  assert.equal(sleepMinutes("22:00", "22:00"), 1440);
  assert.equal(formatDuration(470), "7h 50m");
  assert.equal(formatDuration(480), "8h");
});

test("activity score: steps or miles beat the general level", () => {
  assert.equal(activityScore("gaming", null, null), 0);
  assert.equal(activityScore("sitting", "7k_12k", null), 2);
  assert.equal(activityScore("light", null, 6.5), 3);
  assert.equal(activityScore(null, null, null), null);
});

test("advice from sleep and activity", () => {
  assert.equal(dayAdvice({ sleepMin: 480, sleepGoal: 480, quality: 4, level: "very_active", score: 3 }).dayType, "high_energy");
  const tired = dayAdvice({ sleepMin: 300, sleepGoal: 480, quality: 2, level: "active", score: 1 });
  assert.deepEqual(tired.recs.slice(0, 1), ["steady"]);
  assert.match(tired.sleepLine!, /Short night/);
  assert.equal(dayAdvice({ sleepMin: null, sleepGoal: 480, quality: null, level: "gaming", score: 0 }).dayType, "rest");
});

test("preselects the time of day from the hour", () => {
    assert.equal(slotForHour(2), "midnight_munch");
    assert.equal(slotForHour(5), "early_morning");
    assert.equal(slotForHour(7), "before_work");
    assert.equal(slotForHour(9), "breakfast");
    assert.equal(slotForHour(12), "lunch");
    assert.equal(slotForHour(16), "happy_hour");
    assert.equal(slotForHour(19), "dinner");
    assert.equal(slotForHour(22), "late_night_snack");
  });
test("keeps the slots in the order of the day", () => {
    assert.deepEqual(FOOD_SLOTS.map((s) => s.key), ["early_morning", "before_work", "morning", "breakfast", "lunch", "happy_hour", "dinner", "late_night_snack", "midnight_munch"]);
    assert.ok(slotIndex("dinner") > slotIndex("lunch"));
    assert.equal(slotIndex(null), FOOD_SLOTS.length);
  });
test("reads the hour in a time zone", () => {
    assert.equal(hourIn("America/New_York", new Date("2026-09-30T16:30:00Z")), 12);
    assert.equal(hourIn("America/Phoenix", new Date("2026-09-30T07:00:00Z")), 0);
  });

test("a day person's day follows the clock", () => {
  assert.equal(dayPart(8 * 60), "morning");
  assert.equal(dayPart(13 * 60), "midday");
  assert.equal(dayPart(21 * 60), "night");
  assert.equal(vybeDay("2026-10-02", 1 * 60), "2026-10-01", "1 AM still belongs to last night");
  assert.equal(vybeDay("2026-10-02", 5 * 60), "2026-10-02");
});

test("a night-shift worker (up at 3 PM) gets their own morning, midday and night", () => {
  const wake = "15:00";
  assert.equal(bodyHour(15 * 60, wake), 7);
  assert.equal(dayPart(16 * 60, wake), "morning");
  assert.equal(dayPart(23 * 60, wake), "midday");
  assert.equal(dayPart(4 * 60, wake), "night");
  assert.equal(vybeDay("2026-10-02", 2 * 60, wake), "2026-10-01", "2 AM on shift is still yesterday's day");
  assert.equal(vybeDay("2026-10-02", 13 * 60, wake), "2026-10-02");
});

test("schedule blocks: weekdays, overnight shifts and the most active level", () => {
  const work = { id: "w", label: "Work", level: "sitting" as const, days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };
  const shift = { id: "s", label: "Night shift", level: "active" as const, days: [5], start: "22:00", end: "06:00" };
  assert.equal(blocksFor([work, shift], "2026-10-02").length, 2, "Friday");
  assert.equal(blocksFor([work, shift], "2026-10-03").length, 0, "Saturday");
  assert.equal(blockAt([work], 3, 10 * 60)?.id, "w");
  assert.equal(blockAt([work], 3, 18 * 60), null);
  assert.equal(blockAt([shift], 6, 3 * 60)?.id, "s", "Saturday 3 AM is still Friday night's shift");
  assert.equal(mostActive(["sitting", null, "very_active"]), "very_active");
  assert.equal(mostActive([]), null);
  assert.equal(daysLabel([1, 2, 3, 4, 5]), "Mon–Fri");
  assert.equal(daysLabel([0, 6]), "Weekends");
  assert.equal(daysLabel([1, 3, 5]), "Mon, Wed, Fri");
  assert.equal(daysLabel([2, 3, 4]), "Tue–Thu");
});
