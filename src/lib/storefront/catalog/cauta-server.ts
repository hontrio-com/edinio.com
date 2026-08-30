import {
  buildProductSearchIndex,
  queryProductSearchIndex,
  tokenize,
} from "@/lib/storefront/product-search";
import { documentDeCautare } from "@/lib/storefront/catalog/doc-cautare";
import { comparatorSortare, type CheieSortare } from "@/lib/storefront/catalog/sortare";
import { dinProiectie, proiectieDb, type RandProiectie } from "@/lib/storefront/catalog/din-proiectie";
import type { StorefrontProduct } from "@/lib/storefront/product.types";

/**
 * Cautarea pe palierul server: Postgres alege candidatii, Node le da scorul.
 *
 * MOTORUL NU SE PORTEAZA. `product-search.ts` ruleaza aici NEMODIFICAT, doar cu
 * alt set de intrare: in loc de tot catalogul, produsele care conțin cuvintele
 * cerute. Ponderile (nume 1 / categorie 0,85 / optiuni 0,7 / descriere 0,45),
 * `MATCH_MIN`, bugetul de greseli, ramura „in curs de tastare" si bonusurile de
 * fraza sunt aceleasi OBIECTE, nu aceleasi reguli rescrise — deci ranking-ul e
 * identic prin CONSTRUCTIE, nu prin test. Doua incercari de a muta potrivirea in
 * SQL au picat inainte (vezi `2026-08-14-catalog-index-inversat.sql`); asta e
 * motivul pentru care nu se mai incearca.
 *
 * Ce mai face fisierul: aplica sortarea (aceeasi din `sortare.ts`), feliaza
 * pagina, si numara. Numarul e EXACT — cate produse a gasit motorul, nu cate a
 * intors baza — fiindca scorarea vede intreg setul de candidati.
 */

/** Aceeasi forma pe care o intoarce `catalog_pagina`, ca apelantul sa nu deosebeasca. */
export interface PaginaCautata {
  randuri: RandProiectie[];
  total: number;
}

interface RaspunsRpc {
  randuri: RandProiectie[];
  /** Cate cuvinte are magazinul in vocabular. Zero = neindexat inca. */
  vocabular: number;
  /** Candidatii au depasit plafonul, deci nu s-au citit deloc. */
  prea_larg: boolean;
  /**
   * Interogarea are un cuvant sub trei litere, iar vocabularul incepe de la trei.
   * Deci raspunsul din baza ar fi fost mai SARAC decat cel din browser.
   */
  cuvant_scurt: boolean;
}

/**
 * Sortarea EFECTIVA cat timp se cauta.
 *
 * Browserul compune `searchMatches && !sortTouched ? "relevance" : sort`, iar
 * `sortTouched` porneste ca `!!initialSort` — adica „utilizatorul a cerut o
 * sortare in adresa". Deci: cu `?q=` si fara `?sort=`, ordinea e RELEVANTA, si
 * NU implicitul magazinului.
 *
 * Asta e a patra oara cand aceeasi clasa de defect apare in proiectul asta —
 * server si client compun altfel aceeasi intrare, si iese acelasi NUMAR de
 * produse in alta ordine, deci invizibil din contoare. De aia regula sta intr-o
 * functie cu nume, nu inline la doi apelanti.
 */
export function sortareLaCautare(sortareDinAdresa: string): CheieSortare {
  return (sortareDinAdresa || "relevance") as CheieSortare;
}

/**
 * Intoarce pagina cerută, sau `null` daca palierul server nu poate raspunde.
 *
 * `null` inseamna „cade pe calea veche" (tot catalogul in browser, cautare
 * locala), si are TREI cauze legitime, toate raportate distinct de RPC:
 *   * magazinul n-are inca vocabular — un magazin nou, inaintea primei treceri a
 *     cronului de rezumat;
 *   * candidatii depasesc plafonul — un cuvant foarte comun; o taiere ar fi
 *     aruncat rezultate de top la intamplare, vezi migratia;
 *   * RPC-ul a esuat.
 *
 * Un raspuns GOL nu e null: „n-am gasit nimic" e un rezultat valid si trebuie sa
 * ajunga pe pagina ca atare. Deosebirea conteaza fiindca un catalog gol arata a
 * magazin fara marfa, nu a defect, deci nu-l raporteaza nimeni.
 */
export async function cautaPeServer(args: {
  businessId: string;
  /** Textul BRUT din `?q=`, nu tokenizat: motorul are nevoie de el asa. */
  q: string;
  /** Acelasi obiect de filtre ca la `catalog_pagina`, fara `sortare`. */
  filtre: Record<string, unknown>;
  sortare: CheieSortare;
  limit: number;
  offset: number;
  /** Pentru mesajele de log; nu intra in interogare. */
  slug?: string;
}): Promise<PaginaCautata | null> {
  const cuvinte = tokenize(args.q);
  if (cuvinte.length === 0) return null;

  const { data, error } = await proiectieDb().rpc("catalog_cauta", {
    p_business: args.businessId,
    p_cuvinte: cuvinte,
    p_filtre: args.filtre,
  });

  /*
   * Eroarea se CITESTE. Scris ca `const { data } = await rpc(...)`, un RPC care
   * arunca devenea `data: null` devenea catalog gol, tacut — exact incidentul de
   * la prima aprindere a palierului server.
   */
  if (error || !data) {
    console.error(`[cautare] catalog_cauta a esuat pentru ${args.slug ?? args.businessId}:`,
      error?.message ?? "raspuns gol");
    return null;
  }

  const r = data as RaspunsRpc;
  if (r.vocabular === 0) {
    console.warn(`[cautare] ${args.slug ?? args.businessId} n-are vocabular; cad pe calea veche`);
    return null;
  }
  if (r.prea_larg) {
    // Nu e o eroare, e platoul numit in migratie. Se logheaza ca sa se vada CAND
    // devine frecvent — atunci reparatia e un index de cuvinte cu campul in care
    // a aparut cuvantul, nu un plafon mai mare.
    console.warn(`[cautare] „${args.q}" da prea multi candidati pe ${args.slug ?? args.businessId}; cad pe calea veche`);
    return null;
  }
  if (r.cuvant_scurt) {
    /*
     * Un cuvant sub trei litere. Vocabularul nu-l poate avea, deci raspunsul din
     * baza ar fi fost mai sarac decat cel din browser — nu gol, ci cu un produs
     * sau doua mai putin, adica exact felul de diferenta pe care n-o vede nimeni.
     * Prins de testul diferential pe `?q=a`.
     */
    return null;
  }

  return ordoneazaSiFeliaza(r.randuri ?? [], args.q, args.sortare, args.limit, args.offset);
}

/**
 * Partea care nu atinge baza: scor, ordonare, feliere.
 *
 * Separata ca sa poata fi PROBATA fara baza de date, si probata contra a ceea ce
 * face browserul pe palierul client — vezi `cauta-server.test.ts`. Invariantul
 * care face schema „SQL da recall, Node da ranking" corecta e ca un set de
 * candidati mai LARG nu schimba nimic din ce se vede: produsele care nu potrivesc
 * cad la `MATCH_MIN`, iar ordinea celor care potrivesc nu depinde de cine mai era
 * in lista. Daca invariantul asta cade, cade toata faza.
 */
export function ordoneazaSiFeliaza(
  randuri: RandProiectie[],
  q: string,
  sortare: CheieSortare,
  limit: number,
  offset: number,
): PaginaCautata | null {
  /*
   * Randul brut SI produsul, in pereche.
   *
   * Apelantul are nevoie de randul brut (ca sa traduca `fatete` in indici catre
   * dictionarul rezumatului), iar motorul si sortarea au nevoie de produs. Fara
   * pereche ar fi trebuit o a doua trecere si o harta pe id.
   */
  const perechi = randuri.map((rand) => ({ rand, produs: dinProiectie(rand) }));

  const index = buildProductSearchIndex(perechi.map((x) => documentDeCautare(x.produs)));
  // Textul BRUT, nu cuvintele: un spatiu la sfarsit inseamna „ultimul cuvant e
  // terminat", iar fara el motorul deschide potrivirea de prefix tolerantă la
  // greseli. Tokenizat aici, `?q=bocan` s-ar fi purtat ca `?q=bocan ` si n-ar mai
  // fi gasit „bocanci".
  const scoruri = queryProductSearchIndex(index, q);
  // `null` doar la interogare goala, iar aia s-a exclus de apelant. Verificarea e
  // pentru tipuri, nu pentru un caz real.
  if (!scoruri) return null;

  const potrivite = perechi.filter((x) => scoruri.has(x.produs.id));
  const cmp = comparatorSortare(sortare, scoruri);
  potrivite.sort((a, b) => cmp(a.produs, b.produs));

  const deLa = Math.max(0, offset);
  return {
    randuri: potrivite.slice(deLa, deLa + limit).map((x) => x.rand),
    total: potrivite.length,
  };
}

/**
 * Cate produse gasite se arata in panoul de sub caseta de cautare din header.
 * Restul se vad apasand Enter, in catalog. Vezi `RezultateCautare`.
 */
export const SUGESTII_MAX = 6;

export interface Sugestii {
  produse: StorefrontProduct[];
  total: number;
}

/**
 * Primele cateva produse gasite, pentru panoul din header.
 *
 * Trece prin ACEEASI functie ca grila, cu alta feliere: altfel panoul ar fi fost
 * al doilea motor de cautare al aceluiasi magazin — chiar greseala pe care
 * `doc-cautare.ts` a fost scris ca sa o incheie.
 */
export async function sugestiiDeCautare(args: {
  businessId: string;
  q: string;
  faraImagini: boolean;
  faraStocAscuns: boolean;
  slug?: string;
}): Promise<Sugestii | null> {
  const pagina = await cautaPeServer({
    businessId: args.businessId,
    q: args.q,
    filtre: { faraImagini: args.faraImagini, faraStocAscuns: args.faraStocAscuns },
    sortare: "relevance",
    limit: SUGESTII_MAX,
    offset: 0,
    slug: args.slug,
  });
  if (!pagina) return null;
  return { produse: pagina.randuri.map(dinProiectie), total: pagina.total };
}
