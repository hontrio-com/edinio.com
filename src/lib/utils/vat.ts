// Single source of truth for VAT (TVA) math, shared by both storefront checkout
// modals (CartCheckoutModal, OrderModal) and the server order action so the price
// the customer SEES always equals the price the server CHARGES. Pure + isomorphic.

export interface VatConfig {
  vat_enabled: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  show_vat_breakdown: boolean;
}

/**
 * Eticheta de langa pret: „TVA inclus" sau „fara TVA".
 *
 * Textul se DEDUCE din setarea de preturi, nu se scrie de mana nicaieri. Lasat
 * la alegere, un magazin ar fi putut ajunge sa scrie „TVA inclus" langa preturi
 * pe care serverul le taxeaza pe deasupra — adica exact promisiunea pe care n-o
 * poate tine la finalul comenzii.
 *
 * `null` cand nu e nimic de spus: magazin neplatitor de TVA, sau comerciantul a
 * stins eticheta.
 */
export function vatLabel(cfg: {
  vat_enabled: boolean;
  prices_include_vat: boolean;
  show_vat_label?: boolean;
}): string | null {
  if (!cfg.vat_enabled || cfg.show_vat_label === false) return null;
  return cfg.prices_include_vat ? "TVA inclus" : "fără TVA";
}

// Round to 2 decimals (cents) — mirrors order.actions.ts `round2`.
const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Suma pe care se calculeaza TVA-ul.
 *
 * Se scad TOATE reducerile. TVA-ul se datoreaza pe ce incaseaza comerciantul, nu
 * pe pretul de raft: la marfa de 100 cu un cupon de 20, statul vrea TVA pe 80.
 *
 * Pana in 2026-08-02 baza era INAINTE de reducere, si iesea prost in doua feluri.
 * La magazinele cu preturi fara TVA, clientul chiar platea mai mult: 100 - 20 + 19
 * facea 99, in loc de 95,20. La cele cu preturi cu TVA totalul era corect, dar
 * `vat_amount` scris pe comanda iesea umflat si se contrazicea cu factura, unde
 * reducerea pleaca pe o linie separata si furnizorul isi face singur socoteala pe
 * netul de dupa reducere.
 *
 * Taxa de ramburs INTRA in baza: e un serviciu facturabil, ca extraoptiunile.
 * Transportul NU intra; el isi are regimul lui.
 *
 * Sta aici, intr-un singur loc, fiindca formula are CINCI apelanti: doua cai de
 * comanda pe server, editarea comenzii, si cele doua formulare din magazin. Scrisa
 * de cinci ori, ar apuca-o pe drumuri diferite — s-a mai intamplat de trei ori.
 */
export function vatBase(p: {
  /** Marfa, dupa treptele de cantitate. */
  goods: number;
  extras: number;
  discount: number;
  cardDiscount: number;
  codDiscount: number;
  codFee: number;
}): number {
  const net = p.goods + p.extras - p.discount - p.cardDiscount - p.codDiscount + p.codFee;
  return Math.max(0, round2(net));
}

/**
 * VAT for a goods+extras `base` (see `vatBase` — computed on the post-discount
 * value). Returns:
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
