import { test } from "node:test";
import assert from "node:assert/strict";
import { instagramUrl, osmLinks, providerFor, searchLinks } from "../../src/domain/places/links.ts";

test("recognizes real provider domains only", () => {
  assert.equal(providerFor("https://www.doordash.com/store/x-1"), "doordash");
  assert.equal(providerFor("https://order.doordash.com/store/x"), "doordash");
  assert.equal(providerFor("https://www.opentable.com/r/x"), "opentable");
  assert.equal(providerFor("https://doordash.com.evil.example/x"), null);
  assert.equal(providerFor("not a url"), null);
});

test("Instagram handles become links", () => {
  assert.equal(instagramUrl("@smokepit"), "https://www.instagram.com/smokepit");
  assert.equal(instagramUrl("https://instagram.com/smokepit/"), "https://www.instagram.com/smokepit");
  assert.equal(instagramUrl("not a handle!"), null);
});

test("reads OpenStreetMap link tags", () => {
  const l = osmLinks({
    "contact:instagram": "smokepit", "contact:facebook": "https://www.facebook.com/smokepit", "website:menu": "smokepit.com/menu",
    "website:orders": "https://www.doordash.com/store/smoke-pit-123", "reservation:url": "https://www.opentable.com/r/smoke-pit", website: "https://smokepit.com",
  });
  assert.equal(l.instagram, "https://www.instagram.com/smokepit");
  assert.equal(l.menu, "https://smokepit.com/menu");
  assert.equal(l.doordash, "https://www.doordash.com/store/smoke-pit-123");
  assert.equal(l.opentable, "https://www.opentable.com/r/smoke-pit");
  assert.equal(l.facebook, "https://www.facebook.com/smokepit");
});

test("search fallbacks: no reservations for food trucks", () => {
  assert.ok(searchLinks("Smoke Pit", "Charlotte", "restaurant").some((l) => l.key === "opentable"));
  assert.ok(!searchLinks("Taco Truck", "Charlotte", "food_truck").some((l) => l.key === "opentable"));
});
