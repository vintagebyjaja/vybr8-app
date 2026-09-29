import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../../src/server/safe-redirect.ts";

describe("safeNext", () => {
  it("keeps same-site paths", () => assert.equal(safeNext("/vybe?x=1"), "/vybe?x=1"));
  it("blocks protocol-relative and absolute URLs", () => {
    assert.equal(safeNext("//evil.example"), "/");
    assert.equal(safeNext("https://evil.example"), "/");
    assert.equal(safeNext("/\\evil.example"), "/");
  });
  it("falls back for non-strings", () => assert.equal(safeNext(null, "/home"), "/home"));
});
