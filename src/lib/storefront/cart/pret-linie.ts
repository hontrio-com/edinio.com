import { normalizeazaDefinitia } from "@/lib/customization/definitie";
import { pretUnitar as pretUnitarCuPersonalizare, pretulPersonalizarii } from "@/lib/customization/pret";
import { normalizeazaValorile } from "@/lib/customization/valori";
import { construiesteTrepte, pretPeTrepte, type PretLinie } from "@/lib/storefront/quantity-tiers";
import type { CartItem } from "./normalize";

/**
 * Cat costa o linie de cos — SINGURA socoteala, si de-aia sta aici.
 *
 * ═══ ⚠ CE A COSTAT LIPSA EI ═══
 *
 * Socoteala traia in `CartProvider`, adica intr-o componenta React, deci nu putea fi probata fara
 * browser. Cand personalizarea a intrat in cos, s-a reparat doar jumatatea de la server:
 * `placeCartOrder` repretuia linia, iar cosul si pagina de finalizare aratau mai departe pretul de
 * CATALOG. Un fototapet de 3,5 x 2,5 m se vedea cu 89 de lei si se scria in comanda cu 778,75 —
 * clientul confirma o suma si i se cerea alta la usa, iar coletul pleca asigurat pe 89.
 *
 * Nicio proba n-avea cum sa prinda asta cat timp singurul loc unde traia formula era o componenta.
 *
 * ═══ ⚠ ACELASI MOTOR CA PE SERVER ═══
 *
 * `pretulPersonalizarii` si `pretUnitar` de aici sunt CHIAR functiile pe care le cheama poarta
 * comenzii. Nu se rescrie formula: doua socoteli scrise separat se departeaza, si atunci cosul
 * minte iar, doar cu alte cifre.
 *
 * ⚠ SI ACEEASI ASEZARE: treapta de cantitate se aplica pe BAZA, suplimentul e pe bucata, peste ea.
 * Adunat inainte de trepte, un pachet „3 bucati 250 lei" ar fi redus si gravura, nu doar cana.
 */

/** Ce stie serverul despre un produs din cos — chiar forma intoarsa de `getCartPricing`. */
export interface RegulaPretCos {
  price: number;
  combos: Record<string, number>;
  tiers: unknown;
  customization: unknown;
}

/** Aceeasi rotunjire la ban ca pe server, ca cele doua numere sa fie chiar acelasi numar. */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Suplimentul de personalizare al unei linii, din definitia venita de la server.
 *
 * ⚠ CADE PE NULL cand nu se poate socoti: preturile n-au ajuns inca, produsul nu mai are
 * personalizare, sau valorile nu se mai potrivesc cu definitia. Atunci linia ramane la pretul de
 * catalog — un numar vechi, dar nu unul inventat. Serverul recalculeaza oricum si REFUZA ce nu se
 * potriveste, deci nimeni nu poate cumpara pe pretul asta.
 */
function personalizarea(item: CartItem, regula: RegulaPretCos | undefined) {
  const valori = item.customization;
  if (!valori || typeof valori !== "object" || Object.keys(valori).length === 0) return null;
  const definitie = normalizeazaDefinitia(regula?.customization);
  if (!definitie) return null;
  const curate = normalizeazaValorile(definitie, valori);
  return pretulPersonalizarii(definitie, curate.valori);
}

/**
 * Pretul unei bucati INAINTE de treptele de cantitate — eticheta „N buc x P".
 *
 * ⚠ Invariantul pe care il tine: `bucata x cantitate == subtotal + economie`. Fara personalizare
 * in el, randul ar fi scris „2 buc x 89 lei" langa un total de 1.557,50.
 */
export function pretulBucatii(item: CartItem, regula: RegulaPretCos | undefined): number {
  const catalog = pretulDeCatalog(item, regula);
  const pers = personalizarea(item, regula);
  return pers ? round2(pretUnitarCuPersonalizare(pers, catalog)) : catalog;
}

/** Pretul de catalog al bucatii: al combinatiei alese, altfel al produsului. */
function pretulDeCatalog(item: CartItem, regula: RegulaPretCos | undefined): number {
  if (!regula) return item.price;
  const varianta = item.variantTitle ? regula.combos[item.variantTitle] : undefined;
  return varianta != null ? varianta : regula.price;
}

/** Linia intreaga: cat se afiseaza si cat se incaseaza. */
export function pretulLiniei(item: CartItem, regula: RegulaPretCos | undefined): PretLinie {
  const catalog = pretulDeCatalog(item, regula);
  const peTrepte = pretPeTrepte(construiesteTrepte(regula?.tiers, catalog), item.quantity, catalog);

  const pers = personalizarea(item, regula);
  if (!pers) return peTrepte;

  const bucata = round2(pretUnitarCuPersonalizare(pers, peTrepte.unitPrice));
  const faraTrepte = round2(pretUnitarCuPersonalizare(pers, catalog));
  return {
    index: peTrepte.index,
    unitPrice: bucata,
    subtotal: round2(bucata * item.quantity),
    savings: Math.max(0, round2((faraTrepte - bucata) * item.quantity)),
  };
}
