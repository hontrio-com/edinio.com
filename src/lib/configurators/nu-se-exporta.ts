import { configuratoareleCuVerdict } from "./vitrina";

/**
 * Ce produse dintr-un lot NU au voie sa plece spre un canal din afara.
 *
 * ═══ ⚠ CE COSTA DACA GARDA LIPSESTE ═══
 *
 * Un produs configurabil isi capata pretul abia dupa ce alege cumparatorul: latimea, materialul,
 * gravura, numarul de bucati. Niciunul dintre canalele din afara — eMAG, Trendyol, About You,
 * Google Merchant, Meta, OLX — n-are unde sa poarte alegerile alea inapoi, exact ca la
 * personalizare (`storefront/variants.ts`, `cerePersonalizare`).
 *
 * Exportat, produsul se vinde acolo la PRETUL DE BAZA — adica la pretul unui obiect care nu
 * exista — iar comerciantul primeste o comanda pe care n-are cum s-o onoreze: alege intre a o
 * anula (o plateste in bani si in punctaj la ei) si a trimite ceva la intamplare, la un pret pe
 * care nu l-a cerut nimeni.
 *
 * ⚠ REGULA E „NU SE EXPORTA DELOC", nu „se exporta la pretul de baza". Un pret care nu poate fi
 * corect n-are o varianta mai buna: are doar variante gresite.
 *
 * ═══ ⚠ O CITIRE PE LOT, NICIODATA PE PRODUS ═══
 *
 * `configuratoareleCuVerdict` citeste legaturile, arborele de categorii si versiunile O DATA
 * pentru toata lista. Intrebata pe rand, o rulare de cron cu o suta de produse ar fi facut patru
 * sute de dus-intorsuri, iar feedul Meta — care trece prin TOT catalogul — ar fi facut cate patru
 * pe produs, la fiecare citire a lui Meta.
 *
 * ⚠ Si prima intrebare e cea mai ieftina: „are magazinul asta vreun configurator ACTIV?". Aproape
 * niciunul n-are, iar raspunsul „nu" opreste totul dupa o singura citire pe index. Deci garda nu
 * costa nimic tocmai la magazinele pe care nu le apara.
 *
 * ═══ ⚠ SI VERDICTUL NU SE ARUNCA ═══
 *
 * O harta goala inseamna DOUA lucruri care nu se pot deosebi: „niciun produs n-are configurator"
 * si „citirea a picat". Pe vitrina ele chiar sunt acelasi lucru — produsul se vinde simplu, si
 * asta e degradarea buna pe o pagina.
 *
 * ⚠ La EXPORT nu mai sunt, si de-aia `ok` iese pana aici. O pana de o clipa citita ca „n-are
 * configurator" trimite produsul la marketplace la pretul de baza, iar de acolo nu se mai
 * intoarce cu o reincercare: e listat, se vinde, si comanda vine. Fiecare apelant TREBUIE sa
 * trateze `ok: false` ca pe o cauza trecatoare — se reia, nu se exporta.
 */
export interface ConfigurabileleLotului {
  /** S-a putut afla cu adevarat? `false` = o citire a picat, deci „n-are" nu se poate deduce. */
  ok: boolean;
  /** Id-urile produselor care au acum un configurator servit. */
  ids: Set<string>;
}

export async function configurabileDeExport(
  businessId: string,
  produse: { id: string; category: string | null }[],
): Promise<ConfigurabileleLotului> {
  /* Lista goala nu e o pana: raspunsul „niciunul" e adevarat si complet, si nu costa nicio citire. */
  if (produse.length === 0) return { ok: true, ids: new Set() };
  const { ok, harta } = await configuratoareleCuVerdict(businessId, produse);
  return { ok, ids: new Set(harta.keys()) };
}

/**
 * Ce i se spune comerciantului, in acelasi fel pe toate canalele.
 *
 * ⚠ Spune si CE ARE DE FACUT, nu doar ce s-a intamplat: fara ultima propozitie, mesajul e un
 * diagnostic dintr-o lista pe care omul o vede peste ore, cand nu mai tine minte ce a atins.
 */
export function motivulConfiguratorului(canal: string): string {
  return "Produsul are un configurator: pretul si continutul lui se nasc din ce alege "
    + `cumparatorul, iar o comanda ${canal} n-are unde sa poarte alegerile alea. Publicat, s-ar `
    + "vinde acolo la pretul de baza, si ar veni o comanda imposibil de onorat. Scoate "
    + `configuratorul de pe produs sau scoate produsul de pe ${canal}.`;
}
