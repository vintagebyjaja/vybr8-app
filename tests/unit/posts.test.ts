import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fitWithin,
  formatPrice,
  formatRating,
  isOwnStoragePath,
  parsePriceToCents,
  timeAgo,
  validatePostDraft,
  type PostDraft,
} from "../../src/domain/posts/posts.ts";

const ME = "00000000-0000-4000-8000-0000000000a6";
const OTHER = "00000000-0000-4000-8000-0000000000a4";
const photo = (path = `${ME}/a1.jpg`) => ({ path, width: 1200, height: 1600 });
const draft = (over: Partial<PostDraft> = {}): PostDraft => ({ kind: "plate", photos: [photo()], ...over });

describe("storage paths", () => {
  it("accepts files directly in your own folder", () => assert.ok(isOwnStoragePath(ME, `${ME}/wings-1.jpg`)));
  it("rejects other people's folders, nesting and traversal", () => {
    assert.ok(!isOwnStoragePath(ME, `${OTHER}/wings.jpg`));
    assert.ok(!isOwnStoragePath(ME, `${ME}/nested/wings.jpg`));
    assert.ok(!isOwnStoragePath(ME, `${ME}/../${OTHER}/x.jpg`));
    assert.ok(!isOwnStoragePath(ME, `demo/wings.webp`));
  });
});

describe("validatePostDraft", () => {
  it("accepts a minimal plate", () => {
    const r = validatePostDraft(ME, draft());
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.value.visibility, "public");
  });

  it("requires 1 to 10 photos", () => {
    assert.ok(!validatePostDraft(ME, draft({ photos: [] })).ok);
    const eleven = Array.from({ length: 11 }, (_, i) => photo(`${ME}/p${i}.jpg`));
    assert.ok(!validatePostDraft(ME, draft({ photos: eleven })).ok);
  });

  it("refuses photos uploaded by someone else", () => {
    const r = validatePostDraft(ME, draft({ photos: [photo(`${OTHER}/stolen.jpg`)] }));
    assert.ok(!r.ok);
  });

  it("rounds ratings to one decimal and keeps them in range", () => {
    const r = validatePostDraft(ME, draft({ rating: 9.44 }));
    assert.ok(r.ok && r.value.rating === 9.4);
    assert.ok(!validatePostDraft(ME, draft({ rating: 10.5 })).ok);
    assert.ok(!validatePostDraft(ME, draft({ rating: Number.NaN })).ok);
  });

  it("a Spot post must tag the place", () => {
    assert.ok(!validatePostDraft(ME, draft({ kind: "spot" })).ok);
    assert.ok(validatePostDraft(ME, draft({ kind: "spot", businessId: "00000000-0000-4000-9000-0000000000b1" })).ok);
  });

  it("rejects unknown kinds, visibilities and long captions", () => {
    assert.ok(!validatePostDraft(ME, draft({ kind: "selfie" })).ok);
    assert.ok(!validatePostDraft(ME, draft({ visibility: "everyone" })).ok);
    assert.ok(!validatePostDraft(ME, draft({ caption: "x".repeat(2201) })).ok);
  });

  it("only drink posts can be marked as alcohol", () => {
    const pour = validatePostDraft(ME, draft({ kind: "pour", isAlcoholic: true }));
    assert.ok(pour.ok && pour.value.isAlcoholic);
    assert.ok(!validatePostDraft(ME, draft({ kind: "plate", isAlcoholic: true })).ok);
    const plain = validatePostDraft(ME, draft({ kind: "pour" }));
    assert.ok(plain.ok && !plain.value.isAlcoholic);
  });

  it("trims blank text to null", () => {
    const r = validatePostDraft(ME, draft({ caption: "   ", itemName: "" }));
    assert.ok(r.ok && r.value.caption === null && r.value.itemName === null);
  });
});

describe("helpers", () => {
  it("fits images within the max edge without upscaling", () => {
    assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
    assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  });
  it("parses prices", () => {
    assert.equal(parsePriceToCents("$16.99"), 1699);
    assert.equal(parsePriceToCents("16"), 1600);
    assert.equal(parsePriceToCents("16.5"), 1650);
    assert.equal(parsePriceToCents(""), null);
    assert.ok(Number.isNaN(parsePriceToCents("sixteen")));
  });
  it("formats prices and ratings", () => {
    assert.equal(formatPrice(1699), "$16.99");
    assert.equal(formatPrice(900), "$9");
    assert.equal(formatRating("9.40"), "9.4");
    assert.equal(formatRating(10), "10");
    assert.equal(formatRating(null), null);
  });
  it("formats relative time", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    assert.equal(timeAgo(new Date("2026-09-29T11:59:30Z"), now), "now");
    assert.equal(timeAgo(new Date("2026-09-29T09:00:00Z"), now), "3h");
    assert.equal(timeAgo(new Date("2026-09-27T12:00:00Z"), now), "2d");
  });
});
