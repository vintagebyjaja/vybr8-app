import "server-only";
import { z } from "zod";

/** Server-only configuration. Importing this from a client component fails the build. */
const schema = z
  .object({
    SUPABASE_SECRET_KEY: z.string().optional(),
    MAP_PROVIDER: z.enum(["mock", "mapbox", "google"]).default("mock"),
    AI_PROVIDER: z.enum(["none", "openai"]).default("none"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    BILLING_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    DELIVERY_PROVIDER: z.enum(["links"]).default("links"),
    RESERVATION_PROVIDER: z.enum(["links"]).default("links"),
    ANALYTICS_PROVIDER: z.enum(["none", "console"]).default("none"),
    ERROR_REPORTER: z.enum(["console"]).default("console"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    CRON_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY)
      ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "Required when AI_PROVIDER=openai" });
    if (env.BILLING_PROVIDER === "stripe" && (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET))
      ctx.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "Stripe keys required when BILLING_PROVIDER=stripe" });
  });

const blankToUndefined = (obj: NodeJS.ProcessEnv) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === "" ? undefined : v]));

export const serverEnv = schema.parse(blankToUndefined(process.env));
