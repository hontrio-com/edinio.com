/**
 * Tipurile pe care le impart serverul (cel care semneaza identitatea) si browserul (butonul de chat).
 *
 * ⚠ Numai tipuri. Fisierul n-are nicio linie care sa ruleze, deci il poate aduce si o componenta de client,
 * si `semnaturi.ts` (care e `server-only`), fara ca vreun secret sa treaca dintr-o parte in alta.
 */

/** Cine e clientul, spus de sesiunea de cont. `id` e id-ul contului: stabil si fara inteles in afara noastra. */
export type ClientCunoscut = {
  id: string;
  nume: string;
  email: string;
  telefon: string;
};

/** Ce primeste butonul din vitrina, pe furnizor. Nimic din el nu e secret: e chiar ce pleaca la furnizor. */
export type IdentitateSemnata =
  | { furnizor: "tidio"; id: string; nume: string; email: string; telefon: string }
  | { furnizor: "tawkto"; id: string; hash: string; nume: string; email: string; telefon: string }
  | { furnizor: "intercom"; jwt: string }
  | { furnizor: "zendesk"; jwt: string };

/** Raspunsul rutei `POST /api/cont/suport`. `null` = anonim, sau identitatea nu se trimite. */
export type RaspunsIdentitate = {
  identitate: IdentitateSemnata | null;
  /** O amprenta scurta a contului, ca butonul sa observe schimbarea omului fara sa-i tina datele. */
  amprenta: string | null;
};
