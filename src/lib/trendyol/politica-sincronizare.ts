import type { TrendyolConfig } from "./types";

/**
 * Ce trimite Edinio catre Trendyol la o miscare de stoc / pret: stocul, pretul, amandoua sau nimic.
 *
 * ═══ ⚠ DE CE EXISTA (04.11.2026, cererea VetDepo) ═══
 *
 * Pana azi pretul si stocul plecau MEREU impreuna, prin aceeasi cerere `price-and-inventory`, iar
 * singura oprire era pe LISTARE (`auto_inventory`), care le oprea pe amandoua. Comerciantul vinde
 * pe Trendyol la alte preturi decat in magazin, deci avea de ales intre doua pagube:
 *
 *   - sincronizare pornita: Edinio ii rescrie preturile de pe Trendyol cu cele din magazin;
 *   - listare preluata (oprita): stocul nu mai pleaca deloc, si vinde marfa pe care n-o are.
 *
 * La VetDepo, pe 04.11: 998 de listari preluate din 1.798, deci jumatate de catalog fara stoc
 * trimis. Masurat pe contul lor: un produs avea 48 la Trendyol si 50 in Edinio.
 *
 * ═══ ⚠ COMUTATOARELE NESCRISE INSEAMNA PURTAREA DE PANA AZI ═══
 *
 * Un magazin care n-a salvat niciodata cele doua comutatoare merge exact ca inainte: listarea
 * preluata nu primeste nimic, celelalte primesc tot. Altfel, livrarea asta ar fi inceput sa
 * rescrie preturile listarilor preluate la TOTI comerciantii, adica exact paguba de care se
 * apara `auto_inventory`.
 *
 * Odata scrise, ele hotarasc pentru TOATE listarile, si preluate si create de Edinio (alegerea
 * proprietarului, 04.11: „Două comutatoare pe magazin").
 */
export interface PoliticaSincronizare {
  stoc: boolean;
  pret: boolean;
}

/** A salvat magazinul vreodata cele doua comutatoare? */
export function areComutatoareProprii(
  config: Pick<TrendyolConfig, "sincronizeaza_stocul" | "sincronizeaza_pretul">,
): boolean {
  return typeof config.sincronizeaza_stocul === "boolean" || typeof config.sincronizeaza_pretul === "boolean";
}

export function politicaSincronizare(
  config: Pick<TrendyolConfig, "sincronizeaza_stocul" | "sincronizeaza_pretul">,
  listing: { auto_inventory?: boolean | null },
  { manual = false, forceZero = false }: { manual?: boolean; forceZero?: boolean } = {},
): PoliticaSincronizare {
  if (!areComutatoareProprii(config)) {
    /* Purtarea de pana azi, neschimbata: vezi `computeInventoryItems`. */
    const oprita = listing.auto_inventory === false && !manual && !forceZero;
    return { stoc: !oprita, pret: !oprita };
  }
  return {
    /*
     * ⚠ SCOATEREA DIN VANZARE TRECE PESTE COMUTATOR. `forceZero` vine de la un produs dezactivat
     * sau sters in Edinio: cu stocul oprit, l-am fi lasat de vanzare pe Trendyol. La fel o
     * trimitere ceruta anume de om (`manual`): a apasat „trimite stocul".
     */
    stoc: config.sincronizeaza_stocul !== false || forceZero || manual,
    /*
     * ⚠ PRETUL NU TRECE PESTE COMUTATOR NICIODATA, nici la apasarea omului, nici la scoaterea din
     * vanzare. Comutatorul oprit spune „pretul de pe Trendyol il pun eu acolo": o apasare pe
     * „trimite stocul" nu e o razgandire despre asta.
     */
    pret: config.sincronizeaza_pretul !== false,
  };
}

export type ArticolStocPret = { barcode: string; quantity: number; salePrice: number; listPrice: number };

/**
 * Pune peste ce vrea Edinio valorile ACTUALE de la Trendyol, pentru jumatatea oprita.
 *
 * ═══ ⚠ DE CE NU SE TRIMITE DOAR STOCUL ═══
 *
 * Documentatia lor nu spune nicaieri ca pretul poate lipsi din `price-and-inventory`; exemplul
 * oficial le trimite mereu pe toate patru. Un camp lipsa ar putea fi citit ca zero, si atunci
 * produsul ar pleca la 0 lei. Deci se trimite pretul pe care il au DEJA, citit chiar inainte.
 *
 * ⚠ ARTICOLUL FARA VALOARE ACTUALA SE SCOATE, nu pleaca cu ce are Edinio: n-avem ce pastra, iar
 * a trimite pretul magazinului ar fi exact ce comerciantul a oprit. Acolo unde produsul nu e
 * aprobat la ei, `price-and-inventory` nu se aplica oricum.
 */
export function aplicaPolitica(
  dorite: ArticolStocPret[],
  actuale: ReadonlyMap<string, { quantity: number; salePrice: number; listPrice: number }>,
  pol: PoliticaSincronizare,
): ArticolStocPret[] {
  if (pol.stoc && pol.pret) return dorite;
  if (!pol.stoc && !pol.pret) return [];
  const out: ArticolStocPret[] = [];
  for (const d of dorite) {
    const a = actuale.get(d.barcode);
    if (!a) continue;
    /* ⚠ Pretul pastrat trebuie sa fie unul pe care ei il primesc inapoi: zero sau lipsa ar face
       tot lotul sa cada, si cu el si stocul. Atunci nu se trimite nimic pentru articolul asta. */
    if (!pol.pret && !(a.salePrice > 0)) continue;
    out.push({
      barcode: d.barcode,
      quantity: pol.stoc ? d.quantity : a.quantity,
      salePrice: pol.pret ? d.salePrice : a.salePrice,
      listPrice: pol.pret ? d.listPrice : Math.max(a.listPrice, a.salePrice),
    });
  }
  return out;
}
