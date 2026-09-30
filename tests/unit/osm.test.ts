import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWebsite, kindFor, parseHours, tiles, toImportRow } from "../../src/domain/places/osm.ts";

test("OpenStreetMap categories become VYBR8 kinds", () => {
  assert.equal(kindFor({ amenity: "fast_food" }), "restaurant");
  assert.equal(kindFor({ amenity: "cafe", cuisine: "bubble_tea" }), "tea_shop");
  assert.equal(kindFor({ amenity: "cafe", name: "Juice Joint" }), "juice_bar");
  assert.equal(kindFor({ amenity: "cafe" }), "cafe");
  assert.equal(kindFor({ amenity: "bar", name: "Skyline Lounge" }), "lounge");
  assert.equal(kindFor({ amenity: "bar", name: "Velvet Hookah" }), "hookah_lounge");
  assert.equal(kindFor({ amenity: "pub" }), "bar");
  assert.equal(kindFor({ amenity: "nightclub" }), "nightlife");
  assert.equal(kindFor({ craft: "brewery" }), "brewery");
  assert.equal(kindFor({ shop: "bakery" }), "bakery");
  assert.equal(kindFor({ amenity: "bank" }), null);
});

test("opening hours", () => {
  assert.deepEqual(parseHours("Mo-Fr 11:00-22:00; Sa,Su 10:00-23:00").length, 7);
  assert.deepEqual(parseHours("Tu-Sa 17:00-02:00")[0], { weekday: 2, opens: "17:00", closes: "02:00" });
  assert.equal(parseHours("Mo-Su 11:00-14:00,17:00-22:00").length, 14);
  assert.equal(parseHours("24/7").length, 7);
  assert.deepEqual(parseHours("Mo-Su 11:00-22:00; Mo off").map((h) => h.weekday), [0, 2, 3, 4, 5, 6]);
  assert.deepEqual(parseHours("Fr-Mo 18:00-24:00").map((h) => h.weekday), [0, 1, 5, 6], "wraps past Sunday");
  assert.deepEqual(parseHours("Mo-Fr 11:00-22:00; PH off"), [], "anything fancy is left out rather than guessed");
  assert.deepEqual(parseHours("sunrise-sunset"), []);
});

test("websites are cleaned", () => {
  assert.equal(cleanWebsite("http://mertscharlotte.com/"), "https://mertscharlotte.com");
  assert.equal(cleanWebsite("mertscharlotte.com"), "https://mertscharlotte.com");
  assert.equal(cleanWebsite("not a website"), null);
});

test("a place from OpenStreetMap", () => {
  const r = toImportRow({ type: "way", id: 42, center: { lat: 35.2289, lon: -80.8412 }, tags: {
    amenity: "restaurant", name: "Mert's Heart and Soul", "addr:housenumber": "214", "addr:street": "North College Street",
    "addr:postcode": "28202", cuisine: "soul_food;american", opening_hours: "Mo-Sa 11:00-21:00", website: "http://mertscharlotte.com",
  } });
  assert.equal(r?.ext, "way/42");
  assert.equal(r?.address, "214 North College Street");
  assert.deepEqual(r?.cuisines, ["soul_food", "american"]);
  assert.equal(r?.hours.length, 6);
  assert.equal(toImportRow({ type: "node", id: 1, lat: 1, lon: 1, tags: { amenity: "restaurant" } }), null, "no name, no listing");
  assert.equal(toImportRow({ type: "node", id: 1, lat: 1, lon: 1, tags: { amenity: "restaurant", name: "Old Spot", disused: "yes" } }), null);
});

test("a city is split into small tiles", () => {
  const t = tiles({ north: 35.4, south: 35.05, east: -80.65, west: -81 }, 5);
  assert.equal(t.length, 25);
  assert.equal(t[0]!.south, 35.05);
  assert.equal(t[24]!.north, 35.4);
});

test("capped imports start downtown and with the most complete places", async () => {
  const { tilesCenterOut, rowQuality } = await import("../../src/domain/places/osm.ts");
  const order = tilesCenterOut(5);
  assert.equal(order[0], 12, "the middle tile first");
  assert.equal(order.length, 25);
  assert.equal(new Set(order).size, 25);
  assert.ok([0, 4, 20, 24].includes(order[24]!), "a corner last");
  const bare = { ext: "n/1", name: "A", kind: "restaurant", lat: 0, lng: 0, address: null, postal: null, website: null, phone: null, brand: null, cuisines: [], hours: [] };
  assert.ok(rowQuality({ ...bare, address: "1 Main St", hours: [{ weekday: 1, opens: "11:00", closes: "22:00" }] }) > rowQuality(bare));
});
