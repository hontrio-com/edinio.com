/**
 * Poarta feedurilor publice: minte `products.price` despre produsul asta?
 *
 * ═══ ⚠ CE COSTA CAND NU EXISTA ═══
 *
 * Un feed — Google Merchant sau catalogul Meta — n-are unde sa puna decat un singur numar, si
 * pana acum il lua pe cel din `products.price`. De cand personalizarea are pret, numarul ala
 * poate sa nu fie platit de nimeni: fototapetul cu `includePretulProdusului` stins se anunta cu
 * 89 de lei si costa 603,75 pe pagina.
 *
 * Comerciantul plateste clicul si pierde omul. Iar la Google, nepotrivirea intre pretul din feed
 * si cel de pe pagina e chiar clasa pentru care se suspenda ofertele.
 *
 * ⚠ NU SE PUNE UN PRET NOU, SE INCHIDE POARTA. Un „de la 603,75" in feed ar fi cinstit doar daca
 * pagina arata acelasi numar, iar pagina inca nu-l arata. Pana atunci produsul nu se publica: o
 * oferta lipsa se repara cu o configurare, una mincinoasa se plateste in bani si in cont.
 *
 * ⚠ PRODUSELE VECHI RAMAN PUBLICATE. Cele 29 din productie au doar `text`, `textarea` si `image`,
 * fara niciun pret: podeaua lor e chiar pretul de catalog, deci raspunsul e „nu minte" si feedurile
 * le duc mai departe, exact ca azi. La fel produsul cu supliment OPTIONAL — acolo `products.price`
 * chiar E pretul de pornire.
 */

import { cerePersonalizarea, normalizeazaDefinitia } from "./definitie";
import { pretulDepindeDeAlegeri } from "./pret";

/**
 * Cat citeste poarta dintr-un rand de produs.
 *
 * Ambele feeduri au deja `price` si `page_sections` in `select`, deci poarta nu costa nicio
 * interogare in plus — de-aia sta pe randul intreg, nu pe id.
 */
export interface RandDeCatalog {
  price: number | string | null;
  page_sections?: unknown;
}

/**
 * De ce nu i se mai duce produsul.
 *
 * ⚠ Comerciantul trebuie sa AFLE, nu sa deduca din faptul ca nu mai vinde. Se scrie pe randul lui
 * din `gmc_products`, langa problemele venite de la Google, si se vede in panou ca oricare alta.
 */
/*
 * ⚠ Textul asta il citeste COMERCIANTUL, deci are diacritice — ca vecinul lui din acelasi loc,
 * mesajul eMAG din `emag/pregatire.ts`, si ca restul panoului Google Merchant. Comentariile si
 * codul raman fara, ca peste tot in proiect.
 */
export const MOTIV_PRET_CARE_MINTE =
  "Prețul din catalog nu este cel pe care îl plătește clientul: personalizarea schimbă suma "
  + "finală, iar un feed care anunță alt preț decât pagina duce la suspendarea ofertelor. "
  + "Produsul nu mai pleacă în feed până când prețul din catalog devine chiar prețul de pornire.";

export function pretulDinCatalogMinte(rand: RandDeCatalog): boolean {
  const ps = rand.page_sections as { customization?: unknown } | null | undefined;
  const definitie = normalizeazaDefinitia(ps?.customization);
  /*
   * ⚠ „Fara definitie" NU inseamna „curat". Pe forma SLIMUITA din `slimPageSections` ramane doar
   * steagul `{ cere: true }`, adica „produsul cere personalizare, dar campurile nu sunt aici" —
   * si atunci pretul nu se poate verifica. Un pret neverificat nu pleaca pe feed.
   *
   * Feedurile citesc azi randul intreg din baza, deci ramura nu se atinge; exista pentru ziua in
   * care cineva le va da forma taiata, fiindca atunci defectul s-ar intoarce fara sa se vada.
   */
  if (!definitie) return cerePersonalizarea(rand.page_sections);
  return pretulDepindeDeAlegeri(definitie, Number(rand.price) || 0);
}
