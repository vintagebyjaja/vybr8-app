import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  STOP_STATUS_LABEL, addDays, directionsUrl, formatWindow, groupStopsByDay, liveExpiry, parseTruckFilter, stopState, windowFor, type StopLike,
} from "../../src/domain/trucks/trucks.ts";

const TZ = "America/New_York";
// Tue Sep 29 2026, 2:00 PM in Charlotte (EDT, UTC-4).
const now = new Date("2026-09-29T18:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 3_600_000);
const stop = (start: number, end: number, status: StopLike["status"]): StopLike => ({ startAt: h(start), endAt: h(end), status });

describe("stop state", () => {
  it("open inside the window is here now", () => assert.equal(stopState(stop(-1, 2, "open"), now, TZ), "here_now"));
  it("delayed and sold out inside the window are here now", () => {
    assert.equal(stopState(stop(-1, 2, "delayed"), now, TZ), "here_now");
    assert.equal(stopState(stop(-1, 2, "sold_out"), now, TZ), "here_now");
  });
  it("a scheduled stop is never here now, even inside its window", () => {
    assert.notEqual(stopState(stop(-1, 2, "scheduled"), now, TZ), "here_now");
    assert.notEqual(stopState(stop(3, 5, "scheduled"), now, TZ), "here_now");
  });
  it("an open stop that hasn't started yet isn't here now", () => assert.equal(stopState(stop(3, 5, "open"), now, TZ), "later_today"));
  it("later today vs upcoming uses the city day", () => {
    assert.equal(stopState(stop(4, 6, "scheduled"), now, TZ), "later_today"); // 6 PM
    assert.equal(stopState(stop(20, 22, "scheduled"), now, TZ), "upcoming"); // tomorrow
  });
  it("cancelled stays cancelled", () => {
    assert.equal(stopState(stop(-1, 2, "cancelled"), now, TZ), "cancelled");
    assert.equal(stopState(stop(-5, -2, "cancelled"), now, TZ), "cancelled");
  });
  it("past or closed stops have ended", () => {
    assert.equal(stopState(stop(-5, -1, "open"), now, TZ), "ended");
    assert.equal(stopState(stop(-1, 2, "closed"), now, TZ), "ended");
  });
  it("has a label for every status", () => assert.equal(STOP_STATUS_LABEL.sold_out, "Sold out"));
});

describe("grouping by day", () => {
  it("labels TODAY, TOMORROW, then dates", () => {
    const groups = groupStopsByDay([stop(96, 98, "scheduled"), stop(24, 26, "scheduled"), stop(1, 3, "open")], TZ, now);
    assert.deepEqual(groups.map((g) => g.label), ["TODAY", "TOMORROW", "Sat Oct 3"]);
  });
  it("keeps a stop that started yesterday and is still running under TODAY", () => {
    const g = groupStopsByDay([stop(-16, 1, "open")], TZ, now);
    assert.equal(g[0]!.label, "TODAY");
  });
  it("sorts stops inside a day by start", () => {
    const [today] = groupStopsByDay([stop(3, 4, "scheduled"), stop(1, 2, "scheduled")], TZ, now);
    assert.ok(new Date(today!.stops[0]!.startAt).getTime() < new Date(today!.stops[1]!.startAt).getTime());
  });
});

describe("formatting", () => {
  it("formats a time window in city time", () => {
    assert.equal(formatWindow(new Date("2026-09-29T16:00:00Z"), new Date("2026-09-29T19:00:00Z"), TZ), "12:00 PM – 3:00 PM");
  });
  it("adds calendar days across months", () => assert.equal(addDays("2026-09-30", 3), "2026-10-03"));
  it("builds a directions link", () => assert.equal(directionsUrl(35.2271, -80.8431), "https://www.google.com/maps/dir/?api=1&destination=35.2271,-80.8431"));
});

describe("filter windows", () => {
  it("open now is this minute", () => {
    const w = windowFor("open_now", now, TZ);
    assert.equal(w.from.getTime(), now.getTime());
    assert.ok(w.to.getTime() - now.getTime() <= 60_000);
  });
  it("today runs until midnight city time", () => {
    assert.equal(windowFor("today", now, TZ).to.toISOString(), "2026-09-30T04:00:00.000Z");
  });
  it("weekend is the upcoming Friday 5 PM through Sunday", () => {
    const w = windowFor("weekend", now, TZ);
    assert.equal(w.from.toISOString(), "2026-10-02T21:00:00.000Z");
    assert.equal(w.to.toISOString(), "2026-10-05T04:00:00.000Z");
  });
  it("weekend starts now once it's already the weekend", () => {
    const sat = new Date("2026-10-03T16:00:00Z");
    const w = windowFor("weekend", sat, TZ);
    assert.equal(w.from.getTime(), sat.getTime());
    assert.equal(w.to.toISOString(), "2026-10-05T04:00:00.000Z");
  });
  it("all covers two weeks", () => assert.equal(windowFor("all", now, TZ).to.getTime() - now.getTime(), 14 * 86_400_000));
  it("unknown filters fall back to today", () => assert.equal(parseTruckFilter("nope"), "today"));
});

describe("WE'RE HERE expiry", () => {
  it("clamps to 1–8 hours", () => {
    assert.equal(liveExpiry(0, now).getTime() - now.getTime(), 3_600_000);
    assert.equal(liveExpiry(12, now).getTime() - now.getTime(), 8 * 3_600_000);
    assert.equal(liveExpiry(3, now).getTime() - now.getTime(), 3 * 3_600_000);
    assert.equal(liveExpiry(Number.NaN, now).getTime() - now.getTime(), 3_600_000);
  });
});
