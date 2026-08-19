import { isEmptyDesign, parseStoreDesign } from "./parse";
import type { DesignContext } from "./types";

/**
 * A schimbat altcineva ciorna intre timp?
 *
 * `inBazaRaw` e coloana `storefront_design_draft` asa cum sta acum, iar `baza` e
 * ciorna de la care a pornit fila care scrie. Cand nu se potrivesc, doua file
 * deschise pe acelasi magazin s-ar suprascrie tacut si ultimul care apasa ar
 * castiga tot.
 *
 * ⚠ COLOANA GOALA INSEAMNA `null`, SI ASTA E STAREA OBISNUITA, NU UN CAZ RAR.
 *
 * `storefront_design_draft` e nullable si redevine `NULL` dupa fiecare Publica si
 * dupa fiecare Renunta. Editorul, in schimb, porneste mereu cu un OBIECT pe
 * ecran: ciorna daca exista, altfel designul publicat. Cand cele doua se
 * compara direct, un obiect nu e niciodata egal cu `null`, deci prima salvare de
 * ciorna a oricarui magazin fara ciorna pica cu „Designul a fost modificat in
 * alta fila" — si pica la nesfarsit, fiindca pe ramura de eroare clientul nu
 * avanseaza nimic. De aceea `baza` trebuie sa poarte ce scrie in COLOANA, nu ce
 * se vede pe ecran, iar `null` de ambele parti inseamna „ne-am inteles".
 *
 * Compararea se face pe forma PARSATA, ca doua reprezentari echivalente ale
 * aceleiasi cioarne sa nu para un conflict. Asta cere ca parserul sa fie
 * idempotent — in baza sta deja `parse(design)`, iar clientul trimite `design` —
 * si exact asta verifica testul din `draft-guard.test.ts`.
 */
export function ciornaAFostSchimbata(inBazaRaw: unknown, baza: unknown, ctx: DesignContext): boolean {
  return amprenta(inBazaRaw, ctx) !== amprenta(baza, ctx);
}

/**
 * Amprenta unei cioarne, sau `null` cand nu exista niciuna.
 *
 * `isEmptyDesign` acopera si `{}` sau `null` scrise in coloana de o migratie sau
 * de un client vechi: parsate, ele dau designul classic, care nu e o ciorna, iar
 * fara tratamentul asta o coloana „goala altfel" ar reinvia exact blocajul de
 * mai sus.
 */
function amprenta(raw: unknown, ctx: DesignContext): string | null {
  if (raw === null || raw === undefined || isEmptyDesign(raw)) return null;
  return JSON.stringify(parseStoreDesign(raw, ctx));
}
