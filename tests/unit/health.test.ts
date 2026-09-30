import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, formatClock, gaugeDash, isYmd, mergeDay, milesFrom, recommendationsFor, versusAverage } from "../../src/domain/health/health.ts";

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
