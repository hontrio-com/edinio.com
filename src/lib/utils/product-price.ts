import { combinatiiActiveUnice, comboUnitPrice, parseVariants } from "@/lib/storefront/variants";

export interface PriceRange {
  min: number;
  max: number;
  /** true cand produsul are variante cu preturi diferite (min != max) */
  hasRange: boolean;
  /**
   * Produsul are variante, dar NICIUNA nu se poate cumpara.
   *
   * `min` si `max` raman pe pretul de baza, ca sa nu scrie „0 lei" — dar acel
   * pret nu e o oferta, si cine il afiseaza trebuie sa spuna „Stoc epuizat".
   * Camp obligatoriu, nu optional: un steag optional se uita exact acolo unde
   * conteaza.
   */
  faraOferta: boolean;
}

/**
 * Intervalul de pret al unui produs, calculat din EXACT combinatiile pe care
 * clientul chiar le poate cumpara.
 *
 * Regula asta era scrisa de doua ori si nu spunea acelasi lucru. Ce se poate
 * cumpara (`combinatiiActiveUnice`, `enabledComboPriceMap`, si de acolo comanda)
 * cerea `c.enabled` adevarat si tinea doar PRIMA combinatie per titlu; ce se
 * afisa sarea doar cand `enabled === false` si numara toate randurile, inclusiv
 * titlurile duplicate — 129 de perechi in productie. Deci intervalul putea porni
 * de la un pret care nu era de vanzare, iar cardul promitea „de la 203" pentru un
 * produs care se vinde cu 231.
 *
 * Trei diferente mai marunte, toate aliniate acum la regula vandabila:
 *   - un rand `null` in `combinations` arunca (`c.enabled` pe null), si arunca pe
 *     SERVER, in `slimCatalogProduct`, adica pe toata lista de produse;
 *   - un pret „0" sau nenumeric stergea randul din interval, in loc sa cada pe
 *     pretul de baza cum face `comboUnitPrice` — asa un dus-intors export-import
 *     ridica minimul afisat peste ce se incaseaza;
 *   - `variants.enabled` fara `options` producea un interval, desi peste tot
 *     altundeva un asemenea produs e SIMPLU.
 */
export function getProductPriceRange(basePrice: number, pageSections: unknown): PriceRange {
  const base = Number(basePrice) || 0;
  const variants = parseVariants(pageSections);
  if (!variants) return { min: base, max: base, hasRange: false, faraOferta: false };

  const preturi = combinatiiActiveUnice(variants)
    .map((c) => comboUnitPrice(c, base))
    .filter((p) => Number.isFinite(p) && p > 0);

  if (preturi.length === 0) return { min: base, max: base, hasRange: false, faraOferta: true };

  const min = Math.min(...preturi);
  const max = Math.max(...preturi);
  return { min, max, hasRange: max > min, faraOferta: false };
}
