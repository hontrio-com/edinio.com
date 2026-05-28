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

export const PLAN_PRICE_IDS: Record<string, string> = {
  basic:   process.env.STRIPE_PRICE_BASIC ?? "",
  premium: process.env.STRIPE_PRICE_PREMIUM ?? "",
  ultra:   process.env.STRIPE_PRICE_ULTRA ?? "",
};
