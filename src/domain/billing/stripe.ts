/**
 * Pure Stripe helpers (no network, no secrets) so they can be unit-tested.
 * Signature checking follows Stripe's documented scheme: HMAC-SHA256 of "<timestamp>.<raw body>".
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type PaidPlan = "plus" | "max";
export type Interval = "month" | "year";

/** Prices in cents. Must match the plans table and the pricing page. */
export const PLAN_PRICES: Record<PaidPlan, { name: string; month: number; year: number }> = {
  plus: { name: "VYBR8+", month: 699, year: 4999 },
  max: { name: "VYBR8 MAX", month: 999, year: 7999 },
};

export const isPaidPlan = (v: unknown): v is PaidPlan => v === "plus" || v === "max";
export const isInterval = (v: unknown): v is Interval => v === "month" || v === "year";

/** Each price gets a stable lookup key, so we create it once and find it again. */
export const lookupKey = (plan: PaidPlan, interval: Interval) => `vybr8_${plan}_${interval}`;
export const productId = (plan: PaidPlan) => `vybr8_${plan}`;

/** Which plan a Stripe price is for (from its lookup key, or its metadata as a fallback). */
export function planFromPrice(price: { lookup_key?: string | null; metadata?: Record<string, string> | null } | null | undefined): PaidPlan | null {
  const m = price?.lookup_key?.match(/^vybr8_(plus|max)_(month|year)$/);
  if (m) return m[1] as PaidPlan;
  const meta = price?.metadata?.plan;
  return isPaidPlan(meta) ? meta : null;
}

/** Stripe uses form encoding with bracketed keys: line_items[0][price]=… */
export function formEncode(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => add(`${key}[${i}]`, v));
    else if (typeof value === "object") for (const [k, v] of Object.entries(value as Record<string, unknown>)) add(`${key}[${k}]`, v);
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(obj)) add(prefix ? `${prefix}[${k}]` : k, v);
  return parts.join("&");
}

/** Newer Stripe API versions keep the period end on the subscription item instead of the subscription. */
export function periodEnd(sub: { current_period_end?: number | null; items?: { data?: { current_period_end?: number | null }[] } }): string | null {
  const secs = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return secs ? new Date(secs * 1000).toISOString() : null;
}

/** True when the Stripe-Signature header proves the body came from Stripe (and is recent). */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSecs = Math.floor(Date.now() / 1000), toleranceSecs = 300): boolean {
  if (!header || !secret) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t" && v) t = v;
    else if (k === "v1" && v) sigs.push(v);
  }
  const ts = Number(t);
  if (!t || !Number.isFinite(ts) || !sigs.length) return false;
  if (Math.abs(nowSecs - ts) > toleranceSecs) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  return sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
