/**
 * Sortarile catalogului, ca ordine TOTALA.
 *
 * Sunt aici, si nu inauntrul lui `MiniStoreRenderer`, din doua motive: ca sa se
 * poata testa (in componenta stateau intr-un `useMemo`, inaccesibil), si fiindca
 * aceleasi reguli trebuie sa se mute pe server cand felierea se face in SQL —
 * atunci fisierul asta devine specificatia pe care o oglindeste `ORDER BY`-ul.
 *
 * DE CE ORDINE TOTALA. Niciuna dintre sortari nu avea departajare. „popular"
 * compara un boolean, deci pe un catalog de 3351 de produse aproape toata lista
 * e egala; preturile si datele egale sunt banale. Azi nu se vede, fiindca
 * `Array.prototype.sort` e stabil si felierea se face in memorie peste o lista
 * sortata O SINGURA data — ordinea de intrare tine loc de departajare.
 *
 * In clipa in care pagina 2 vine dintr-un `LIMIT/OFFSET` separat, acea plasa
 * dispare: doua interogari independente pot aseza altfel aceleasi randuri egale,
 * si atunci un produs apare pe doua pagini iar altul nu apare pe niciuna. De aia
 * se repara INAINTE de paginarea pe server, nu odata cu ea.
 */

/** Exact campurile de care depinde ordonarea. Nu cere tot produsul. */
export interface ProdusSortabil {
  id: string;
  name: string;
  price_range: { min: number };
  is_featured: boolean | null;
  sort_order: number | null;
  created_at: string;
}

export type CheieSortare = "relevance" | "price_asc" | "price_desc" | "popular" | "name_asc" | "newest";

/**
 * Departajarea finala. `id` e cheia primara, deci e unic prin constructie —
 * dupa el nu mai exista egalitate, adica ordinea e totala.
 *
 * Comparare de siruri, nu `localeCompare`: id-urile sunt UUID-uri, iar aici
 * conteaza doar sa fie DETERMINIST, nu sa fie pe intelesul cuiva.
 */
export const dupaId = (a: ProdusSortabil, b: ProdusSortabil) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Compararea numelor, fixata pe romana.
 *
 * `localeCompare(x)` fara argument foloseste locale-ul implicit al mediului —
 * `ro-RO` pe o masina romaneasca, `en-US` pe serverul Vercel. Adica ordinea
 * catalogului depindea de unde se intampla sa ruleze codul. Se vede la
 * diacritice si la numerele din nume.
 *
 * `numeric` compara numerele din nume ca numere: „Cizma 2" inaintea lui
 * „Cizma 10", nu invers. Perechea din SQL exista si e verificata pe instanta —
 * colatia ICU `ro-RO-u-kn-true` da exact aceeasi ordine — deci cand sortarea se
 * muta pe server nu apare divergenta.
 */
export const numeRomaneste = (a: string, b: string) => a.localeCompare(b, "ro", { numeric: true });

const laMilisecunde = (iso: string) => {
  const t = new Date(iso).getTime();
  // O data invalida ar face NaN, iar NaN intr-un comparator strica sortarea
  // TOATA (comparatiile devin inconsistente, nu doar randul cu pricina).
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Comparatorul unei sortari. `scoruri` e harta de relevanta a cautarii; e
 * folosita doar de „relevance", care nici nu exista cand nu se cauta.
 */
export function comparatorSortare(
  cheie: CheieSortare,
  scoruri?: ReadonlyMap<string, number> | null,
): (a: ProdusSortabil, b: ProdusSortabil) => number {
  switch (cheie) {
    case "relevance":
      return (a, b) =>
        ((scoruri?.get(b.id) ?? 0) - (scoruri?.get(a.id) ?? 0))
        || (laMilisecunde(b.created_at) - laMilisecunde(a.created_at))
        || dupaId(a, b);
    case "price_asc":
      return (a, b) => (a.price_range.min - b.price_range.min) || dupaId(a, b);
    case "price_desc":
      return (a, b) => (b.price_range.min - a.price_range.min) || dupaId(a, b);
    // `sort_order` ca a doua treapta: ordinea SQL a catalogului e
    // `is_featured desc, sort_order, id` (vezi interogarile din [slug]/page.tsx
    // si pagina-magazin.tsx). Fara ea, „popular" se abatea de la ordinea in care
    // serverul citeste oricum produsele.
    case "popular":
      return (a, b) =>
        ((b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0))
        || ((a.sort_order ?? 0) - (b.sort_order ?? 0))
        || dupaId(a, b);
    case "name_asc":
      return (a, b) => numeRomaneste(a.name, b.name) || dupaId(a, b);
    case "newest":
    default:
      return (a, b) => (laMilisecunde(b.created_at) - laMilisecunde(a.created_at)) || dupaId(a, b);
  }
}
