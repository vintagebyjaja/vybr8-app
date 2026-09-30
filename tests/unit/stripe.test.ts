import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { formEncode, periodEnd, planFromPrice, verifyStripeSignature } from "../../src/domain/billing/stripe.ts";

const secret = "whsec_test123";
const sign = (body: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

test("accepts a real Stripe signature and rejects everything else", () => {
  const body = '{"id":"evt_1"}';
  const now = 1_800_000_000;
  assert.ok(verifyStripeSignature(body, sign(body, now), secret, now));
  assert.ok(!verifyStripeSignature(body + " ", sign(body, now), secret, now), "body changed");
  assert.ok(!verifyStripeSignature(body, sign(body, now), "whsec_other", now), "wrong secret");
  assert.ok(!verifyStripeSignature(body, sign(body, now - 600), secret, now), "too old (replay)");
  assert.ok(!verifyStripeSignature(body, null, secret, now), "no header");
  assert.ok(!verifyStripeSignature(body, `t=${now},v1=abc`, secret, now), "garbage signature");
  assert.ok(verifyStripeSignature(body, `${sign(body, now)},v1=deadbeef`, secret, now), "any valid v1 is enough");
});

test("form encoding matches Stripe's bracket style", () => {
  assert.equal(
    formEncode({ mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], metadata: { user_id: "u 1" } }),
    "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Buser_id%5D=u%201",
  );
});

test("reads the plan and renewal date from Stripe objects", () => {
  assert.equal(planFromPrice({ lookup_key: "vybr8_max_year" }), "max");
  assert.equal(planFromPrice({ lookup_key: null, metadata: { plan: "plus" } }), "plus");
  assert.equal(planFromPrice({ lookup_key: "something_else" }), null);
  assert.equal(periodEnd({ current_period_end: 1_800_000_000 }), "2027-01-15T08:00:00.000Z");
  assert.equal(periodEnd({ items: { data: [{ current_period_end: 1_800_000_000 }] } }), "2027-01-15T08:00:00.000Z");
  assert.equal(periodEnd({}), null);
});
