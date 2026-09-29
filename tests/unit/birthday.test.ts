import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  hasPourAccess,
  ageOn,
  birthdayStatus,
  isDrinkingAge,
  isOldEnough,
  nextBirthday,
  parseYmd,
  perkUsableOn,
  todayIn,
  toYmdString,
} from "../../src/domain/birthday/birthday.ts";

const d = (s: string) => parseYmd(s)!;

describe("dates", () => {
  it("parses only real calendar dates", () => {
    assert.ok(parseYmd("1996-02-29"));
    assert.equal(parseYmd("1997-02-29"), null);
    assert.equal(parseYmd("2000-13-01"), null);
    assert.equal(parseYmd("09/28/2000"), null);
  });
});

describe("age rules", () => {
  it("VYBR8 is 13+: allows someone turning 13 today, refuses the day before", () => {
    assert.ok(isOldEnough(d("2013-09-28"), d("2026-09-28")));
    assert.ok(!isOldEnough(d("2013-09-29"), d("2026-09-28")));
  });
  it("alcohol is 21+: a 16-year-old can join but is not drinking age", () => {
    assert.ok(isOldEnough(d("2010-06-01"), d("2026-09-28")));
    assert.ok(!isDrinkingAge(d("2010-06-01"), d("2026-09-28")));
    assert.ok(isDrinkingAge(d("2005-09-28"), d("2026-09-28")));
    assert.ok(!isDrinkingAge(d("2005-09-29"), d("2026-09-28")));
  });
  it("counts age in whole years", () => {
    assert.equal(ageOn(d("1994-10-05"), d("2026-10-04")), 31);
    assert.equal(ageOn(d("1994-10-05"), d("2026-10-05")), 32);
  });
  it("leap-day birthdays reach 21 on Mar 1 in non-leap years (matches the database)", () => {
    assert.ok(!isDrinkingAge(d("2004-02-29"), d("2025-02-28")));
    assert.ok(isDrinkingAge(d("2004-02-29"), d("2025-03-01")));
  });
  it("refuses future birthdates", () => assert.ok(!isOldEnough(d("2030-01-01"), d("2026-09-28"), 0)));
});

describe("next birthday", () => {
  it("is this year if it hasn't happened yet", () => assert.equal(toYmdString(nextBirthday(d("1994-10-05"), d("2026-09-28"))), "2026-10-05"));
  it("is today on the day", () => assert.equal(toYmdString(nextBirthday(d("1994-10-05"), d("2026-10-05"))), "2026-10-05"));
  it("rolls to next year once passed", () => assert.equal(toYmdString(nextBirthday(d("1994-10-05"), d("2026-10-06"))), "2027-10-05"));
  it("celebrates Feb 29 on Feb 28 in non-leap years", () => {
    assert.equal(toYmdString(nextBirthday(d("1996-02-29"), d("2027-01-10"))), "2027-02-28");
    assert.equal(toYmdString(nextBirthday(d("1996-02-29"), d("2028-01-10"))), "2028-02-29");
  });
});

describe("perk windows", () => {
  const bday = d("1994-10-05");
  it("day perks only on the birthday", () => {
    assert.ok(perkUsableOn("day", bday, d("2026-10-05")));
    assert.ok(!perkUsableOn("day", bday, d("2026-10-06")));
  });
  it("week perks within 3 days either side", () => {
    assert.ok(perkUsableOn("week", bday, d("2026-10-02")));
    assert.ok(perkUsableOn("week", bday, d("2026-10-08")));
    assert.ok(!perkUsableOn("week", bday, d("2026-10-09")));
  });
  it("week perks work across New Year", () => {
    assert.ok(perkUsableOn("week", d("1990-01-01"), d("2026-12-30")));
    assert.ok(perkUsableOn("week", d("1990-12-31"), d("2027-01-02")));
  });
  it("month perks during the birthday month", () => {
    assert.ok(perkUsableOn("month", bday, d("2026-10-31")));
    assert.ok(!perkUsableOn("month", bday, d("2026-11-01")));
  });
});

describe("status and today", () => {
  it("reports today, soon and later", () => {
    assert.deepEqual(birthdayStatus(d("1994-10-05"), d("2026-10-05")), { kind: "today" });
    const soon = birthdayStatus(d("1994-10-05"), d("2026-09-28"));
    assert.ok(soon.kind === "soon" && soon.days === 7);
    assert.equal(birthdayStatus(d("1991-12-20"), d("2026-09-28")).kind, "later");
  });
  it("uses the calendar date in the given time zone", () => {
    // 02:00 UTC on Sep 29 is still Sep 28 in New York.
    assert.equal(toYmdString(todayIn("America/New_York", new Date("2026-09-29T02:00:00Z"))), "2026-09-28");
  });
});

it("Pours unlock 5 days before the 21st birthday", () => {
  const today = { y: 2026, m: 9, d: 29 };
  assert.equal(hasPourAccess({ y: 2005, m: 10, d: 4 }, today), true, "5 days before");
  assert.equal(hasPourAccess({ y: 2005, m: 10, d: 5 }, today), false, "6 days before");
  assert.equal(hasPourAccess({ y: 2005, m: 9, d: 29 }, today), true, "21st birthday");
  assert.equal(hasPourAccess({ y: 2012, m: 1, d: 1 }, today), false, "teen");
  assert.deepEqual(addDays({ y: 2026, m: 12, d: 29 }, 5), { y: 2027, m: 1, d: 3 });
});
