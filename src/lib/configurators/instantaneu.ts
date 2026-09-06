/**
 * Instantaneul configuratiei, citit dintr-o comanda.
 *
 * ═══ ⚠ DE CE UN CITITOR APARTE, CAND SCRIEM TOT NOI ═══
 *
 * `orders.items` e jsonb, si randul din baza poate fi scris acum trei luni, de o versiune de cod
 * care nu mai exista. Se poate si edita din panou, si rescrie de un import, si atinge de mana din
 * consola. Un `as InstantaneuConfiguratie` ar fi o promisiune pe care n-o poate tine nimeni: prima
 * comanda cu forma veche ar fi aruncat la randare, adica exact pe ecranul din care comerciantul
 * trebuie sa afle ce are de facut.
 *
 * ⚠ SI CE COSTA daca citim prea putin: linia arata „Cana personalizata x1 — 89 lei" si atat.
 * Atelierul nu afla ce gravura, iar comerciantul cu doua cani gravate diferit vede DOUA RANDURI
 * IDENTICE pe fiecare ecran.
 *
 * ═══ CE SE CERE, SI CE E DE BUNAVOIE ═══
 *
 * Se cere `rezumat`-ul: el e singurul lucru pe care il citeste un om. Fara macar un rand de
 * rezumat, instantaneul nu are ce arata si se intoarce `null` — mai bine nimic decat o eticheta
 * goala care sugereaza ca s-a pierdut ceva.
 *
 * Restul — id-uri, numar de versiune, amprenta, valorile brute — sunt pentru urmarire si pentru
 * o eventuala recalculare, si lipsa lor nu opreste afisarea.
 */

import { normalizeazaValori, type Valori } from "./valori";
import type { RandRezumat } from "./rezumat";

/** Cate randuri se citesc, si cat de lungi. Aceleasi margini ca la linia de cos. */
const MAX_RANDURI = 50;
const MAX_TEXT = 200;

export interface InstantaneuCitit {
  configuratorId: string | null;
  versiuneId: string | null;
  numarVersiune: number | null;
  amprenta: string | null;
  /** Ce citeste omul. Cel putin un rand, altfel instantaneul nu se intoarce deloc. */
  rezumat: RandRezumat[];
  /** Valorile brute, pentru urmarire. Poate fi gol. */
  valori: Valori;
}

export function citesteInstantaneul(brut: unknown): InstantaneuCitit | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const o = brut as Record<string, unknown>;

  const rezumat = citesteRezumatul(o.rezumat);
  if (rezumat.length === 0) return null;

  return {
    configuratorId: sir(o.configuratorId),
    versiuneId: sir(o.versiuneId),
    numarVersiune: typeof o.numarVersiune === "number" && Number.isFinite(o.numarVersiune)
      ? o.numarVersiune : null,
    amprenta: sir(o.amprenta),
    rezumat,
    // ⚠ Trece prin normalizare, nu se ia asa cum vine: forma poate fi de acum trei luni.
    valori: normalizeazaValori(o.valori),
  };
}

/** Instantaneul unei linii de comanda, cand are unul. */
export function instantaneulLiniei(linie: unknown): InstantaneuCitit | null {
  if (!linie || typeof linie !== "object") return null;
  return citesteInstantaneul((linie as Record<string, unknown>).configuratie);
}

function sir(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.slice(0, MAX_TEXT) : null;
}

/**
 * Randurile de rezumat, curatate.
 *
 * ⚠ Se taie si ca numar, si ca lungime. Textele astea se pun pe un ecran de panou, pe un email si
 * pe continutul unui AWB; un sir de zece mii de caractere ajuns acolo dintr-o comanda veche sau
 * dintr-o editare de mana ar fi rupt asezarea in toate trei.
 */
function citesteRezumatul(brut: unknown): RandRezumat[] {
  if (!Array.isArray(brut)) return [];
  const out: RandRezumat[] = [];
  for (const x of brut.slice(0, MAX_RANDURI)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (typeof r.eticheta !== "string" || typeof r.valoare !== "string") continue;
    if (!r.eticheta.trim() || !r.valoare.trim()) continue;
    out.push({
      id: typeof r.id === "string" ? r.id.slice(0, MAX_TEXT) : "",
      eticheta: r.eticheta.slice(0, MAX_TEXT),
      valoare: r.valoare.slice(0, MAX_TEXT),
      scurt: r.scurt === true,
    });
  }
  return out;
}
