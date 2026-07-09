import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}

/** @deprecated Use getStripe() instead — kept for backward compatibility */
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const PLAN_PRICE_IDS: Record<string, { monthly: string; annual: string }> = {
  basic:   { monthly: process.env.STRIPE_PRICE_BASIC ?? "",   annual: process.env.STRIPE_PRICE_BASIC_ANNUAL ?? "" },
  premium: { monthly: process.env.STRIPE_PRICE_PREMIUM ?? "", annual: process.env.STRIPE_PRICE_PREMIUM_ANNUAL ?? "" },
  ultra:   { monthly: process.env.STRIPE_PRICE_ULTRA ?? "",   annual: process.env.STRIPE_PRICE_ULTRA_ANNUAL ?? "" },
};

/** Returneaza Stripe price ID pentru un plan + interval (implicit lunar). */
export function getPriceId(plan: string, interval: "monthly" | "annual" = "monthly"): string {
  return PLAN_PRICE_IDS[plan]?.[interval] ?? "";
}
