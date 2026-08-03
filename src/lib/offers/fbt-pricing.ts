import { computeBundlePricing, type BundlePricingMode } from "@/lib/bundles";

/**
 * Pretul companionilor la „Cumpara impreuna".
 *
 * Sta singura in fisierul asta, ca `aplicaBumpPeOBucata`: e aritmetica de bani,
 * n-are nevoie de baza de date, deci poate fi testata direct.
 */

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Cat din configuratia ofertei conteaza pentru pret. */
export interface ConfigReducereSet {
  discountMode: string;
  discountPercent?: number;
  discountAmount?: number;
  fixedPrice?: number;
}

function modBundle(mode: string): BundlePricingMode | null {
  if (mode === "percent") return "discount_percent";
  if (mode === "amount") return "discount_amount";
  if (mode === "fixed_price") return "fixed";
  return null; // "none"
}

/**
 * Distribuie economia setului pe preturile COMPANIONILOR — ancora ramane la
 * pretul intreg, fiindca ea e produsul comandat din caseta de cumparare.
 * Deterministic, si folosit deopotriva de previzualizarea din magazin si de
 * calculul la comanda, ca cele doua sa nu poata da preturi diferite.
 *
 * Companionii duc doar COTA LOR din economie, nu toata. Pana acum economia se
 * calcula pe TOT setul si se descarca integral pe ei, plafonata doar la valoarea
 * lor: pe o ancora scumpa, procentul din setul intreg trecea de cat fac
 * companionii cu totul, iar plafonul ii ducea la zero. Pe oferta live f2d3c415
 * de la BricoSmart, ancora „Emul solutie umectanta 20L" de 1.244,88 lei facea ca
 * cei patru companioni de 112,99 lei sa plece pe degeaba, desi comerciantul
 * scrisese 10%.
 *
 * Cu cota, „10% pe set" inseamna 10% si pe partea companionilor, oricat de
 * scumpa ar fi ancora. Plafonul la valoarea lor ramane centura de siguranta.
 */
export function fbtCompanionPrices(
  anchorPrice: number,
  companionPrices: number[],
  config: ConfigReducereSet,
): number[] {
  const mode = modBundle(config.discountMode);
  if (!mode) return companionPrices.map((p) => round2(p));
  const pricing = computeBundlePricing(
    [anchorPrice, ...companionPrices].map((p) => ({ price: p, quantity: 1 })),
    mode,
    { fixedPrice: config.fixedPrice, discountPercent: config.discountPercent, discountAmount: config.discountAmount },
  );
  return imparteEconomiaCompanionilor(anchorPrice, companionPrices, pricing.savings);
}

/**
 * Economia setului, impartita pe companioni — SINGURUL loc unde se face.
 *
 * Formula era scrisa de doua ori: aici, pentru ce se incaseaza, si in
 * `distributeFbtSavings`, pentru ce se afiseaza pe cardul din pagina de produs.
 * Cat timp amandoua descarcau toata economia pe companioni, cele doua copii
 * dadeau acelasi numar si nimeni nu observa ca sunt doua. Prima schimbare de
 * formula le-ar fi despartit, si pe ecran ar fi scris alt pret decat cel incasat.
 */
export function imparteEconomiaCompanionilor(
  anchorPrice: number,
  companionPrices: number[],
  economiaSetului: number,
): number[] {
  const compTotal = round2(companionPrices.reduce((s, p) => s + p, 0));
  if (compTotal <= 0) return companionPrices.map((p) => round2(p));
  const setTotal = round2(Math.max(0, anchorPrice) + compTotal);
  const cotaCompanioni = setTotal > 0 ? compTotal / setTotal : 0;
  const savings = Math.min(economiaSetului * cotaCompanioni, compTotal);
  if (savings <= 0) return companionPrices.map((p) => round2(p));
  return companionPrices.map((p) => round2(Math.max(0, p - savings * (p / compTotal))));
}
