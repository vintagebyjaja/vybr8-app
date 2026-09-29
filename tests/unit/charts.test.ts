import { test } from "node:test";
import assert from "node:assert/strict";
import { CHART_SIZE, chartHeading, dishTypeTitle, parseKind, parseTab } from "../../src/domain/charts/charts.ts";

test("dish types read like titles", () => {
  assert.equal(dishTypeTitle("wings"), "Wings");
  assert.equal(dishTypeTitle("mac-and-cheese"), "Mac & Cheese");
  assert.equal(dishTypeTitle("espresso_martini"), "Espresso Martini");
});

test("the headline chart is a Top 25", () => {
  assert.equal(CHART_SIZE, 25);
  assert.equal(chartHeading("Places", CHART_SIZE), "Top 25 Places");
});

test("unknown tabs and kinds fall back safely", () => {
  assert.equal(parseTab(undefined), "top");
  assert.equal(parseTab("drinks"), "drinks");
  assert.equal(parseTab("<script>"), "top");
  assert.equal(parseKind("plates"), "plates");
  assert.equal(parseKind("admin"), null);
});
