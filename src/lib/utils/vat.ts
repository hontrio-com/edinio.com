// Single source of truth for VAT (TVA) math, shared by both storefront checkout
// modals (CartCheckoutModal, OrderModal) and the server order action so the price
// the customer SEES always equals the price the server CHARGES. Pure + isomorphic.

export interface VatConfig {
  vat_enabled: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  show_vat_breakdown: boolean;
}

// Round to 2 decimals (cents) — mirrors order.actions.ts `round2`.
const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * VAT for a goods+extras `base` (computed on the PRE-discount value, matching the
 * server). Returns:
 *  - `vatAmount`: the VAT figure shown to the customer.
 *  - `vatAddOn`: what actually gets added to the grand total.
 *
 * When prices already include VAT, `vatAmount` is the portion extracted FROM the
 * base (informational only) and `vatAddOn` is 0 — the total is unchanged. When
 * prices are VAT-exclusive, VAT is added on top, so `vatAddOn` equals `vatAmount`.
 */
export function computeVat(
  base: number,
  cfg: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean },
): { vatAmount: number; vatAddOn: number } {
  if (!cfg.vat_enabled || base <= 0) return { vatAmount: 0, vatAddOn: 0 };
  const rate = cfg.vat_rate / 100;
  const vatAmount = cfg.prices_include_vat
    ? round2(base - base / (1 + rate))
    : round2(base * rate);
  return { vatAmount, vatAddOn: cfg.prices_include_vat ? 0 : vatAmount };
}
