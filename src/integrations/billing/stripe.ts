import "server-only";
import { PLAN_PRICES, formEncode, lookupKey, productId, type Interval, type PaidPlan } from "@/domain/billing/stripe";

/**
 * Minimal Stripe REST client (no SDK needed). Secret key stays on the server.
 * Docs: https://docs.stripe.com/api
 */
export class StripeError extends Error {
  readonly code?: string;
  readonly status?: number;
  constructor(message: string, code?: string, status?: number) { super(message); this.code = code; this.status = status; }
}

export function stripeApi(secretKey: string) {
  async function call<T>(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}): Promise<T> {
    const qs = formEncode(params);
    const res = await fetch(`https://api.stripe.com/v1/${path}${method === "GET" && qs ? `?${qs}` : ""}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: method === "POST" ? qs : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } } & T;
    if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe error ${res.status}`, json.error?.code, res.status);
    return json;
  }
  return {
    get: <T>(path: string, params?: Record<string, unknown>) => call<T>("GET", path, params),
    post: <T>(path: string, params?: Record<string, unknown>) => call<T>("POST", path, params),
  };
}
export type StripeApi = ReturnType<typeof stripeApi>;

/**
 * Stripe needs a tax code on each product (required when Managed Payments is on).
 * txcd_10103000 = "Software as a service (SaaS) - personal use", which fits a VYBR8+ / MAX membership.
 */
export const TAX_CODE = "txcd_10103000";

/** Makes sure the plan's product exists and has its tax code (older products are fixed in place). */
async function ensureProduct(api: StripeApi, plan: PaidPlan): Promise<void> {
  const id = productId(plan);
  try {
    const p = await api.get<{ tax_code?: string | { id?: string } | null }>(`products/${id}`);
    const code = typeof p.tax_code === "string" ? p.tax_code : p.tax_code?.id;
    if (code !== TAX_CODE) await api.post(`products/${id}`, { tax_code: TAX_CODE });
  } catch (e) {
    if (!(e instanceof StripeError && e.status === 404)) throw e;
    await api.post("products", { id, name: PLAN_PRICES[plan].name, tax_code: TAX_CODE, metadata: { plan } });
  }
}

/** Finds the price for a plan, creating the product and price the first time. */
export async function ensurePrice(api: StripeApi, plan: PaidPlan, interval: Interval): Promise<string> {
  await ensureProduct(api, plan);
  const key = lookupKey(plan, interval);
  const found = await api.get<{ data: { id: string }[] }>("prices", { lookup_keys: [key], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;

  const info = PLAN_PRICES[plan];
  const price = await api.post<{ id: string }>("prices", {
    product: productId(plan), currency: "usd", unit_amount: info[interval], recurring: { interval },
    lookup_key: key, transfer_lookup_key: true, metadata: { plan, interval },
  });
  return price.id;
}
