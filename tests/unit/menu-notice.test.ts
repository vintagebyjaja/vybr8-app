import { test } from "node:test";
import assert from "node:assert/strict";
import { menuNotice } from "../../src/domain/menus/menus.ts";

const it = (source: "owner" | "team" | "brand" | "import", lastVerified: string | null = null) => ({ source, lastVerified });

test("chain menus say they're shared and show no prices", () => {
  const n = menuNotice([it("brand"), it("brand")], { claimed: false, brandName: "Chick-fil-A" });
  assert.equal(n?.title, "Chick-fil-A menu");
  assert.match(n!.body, /vary by location/);
});

test("imported menus show the date their prices are from", () => {
  const n = menuNotice([it("import", "2025-12-16"), it("import", "2026-10-10")], { claimed: false, brandName: null });
  assert.match(n!.body, /Dec 2025/);
});

test("an owner's own menu has no notice; an unclaimed Team menu does", () => {
  assert.equal(menuNotice([it("owner")], { claimed: true, brandName: null }), null);
  assert.equal(menuNotice([it("owner")], { claimed: false, brandName: null })?.title, "Part of the menu.");
  assert.equal(menuNotice([], { claimed: false, brandName: null }), null);
});
