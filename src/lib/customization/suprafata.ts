import type { Rotunjire, Unitate } from "./definitie";

/**
 * Suprafata, si cat din ea se factureaza.
 *
 * ═══ ⚠ DE CE E UN MODUL SEPARAT ═══
 *
 * Fiindca aici sta singura aritmetica din toata personalizarea in care o greseala nu se vede: o
 * conversie ratata de la centimetri la metri da un pret de 10.000 de ori mai mare sau mai mic, si
 * amandoua trec de orice validare de „numar finit, pozitiv". Un modul separat inseamna probe
 * separate, cu cifre scrise pe fata.
 */

/**
 * Prin cat se IMPARTE ca sa iasa metri. Se socoteste mereu in metri, oricum ar scrie comerciantul.
 *
 * ⚠ IMPARTIRE, nu inmultire cu 0,01 — si diferenta se vede in pretul afisat.
 *
 * `70 * 0.01` da `0.7000000000000001`, fiindca 0,01 nu se scrie exact in binar; `70 / 100` da
 * `0.7`. Cu inmultirea, o suprafata de 0,7 m² ajungea pe ecranul comerciantului si in comanda cu
 * saisprezece zecimale. Masurat, nu presupus: prima versiune a probei de mai jos a picat exact pe
 * cifra asta.
 */
const IMPARTITOR: Record<Unitate, number> = { mm: 1000, cm: 100, m: 1 };

/**
 * ⚠ Plafon pe o latura, in metri.
 *
 * Nu apara de comerciant — el isi pune singur `min`/`max` — ci de valorile care ajung din browser
 * pe drumul comenzii. Fara el, o latime de 10^9 trimisa de mana ar fi dat o suprafata de 10^18 m²
 * si un pret pe care nicio alta socoteala din platforma nu-l mai poate purta. 100 m acopera orice
 * fototapet, banner sau panou care se produce cu adevarat.
 */
export const MAX_LATURA_M = 100;

/** Suprafata maxima care se poate socoti, in m². Perechea plafonului de mai sus. */
export const MAX_M2 = MAX_LATURA_M * MAX_LATURA_M;

/**
 * O latura, adusa in metri.
 *
 * `null` cand nu se poate socoti — si atunci NIMIC nu se pretuieste pe suprafata. Vezi
 * `pret.ts`: un pret pe m² fara m² ar fi iesit zero, adica marfa data pe gratis.
 */
export function inMetri(valoare: unknown, unitate: Unitate): number | null {
  const n = Number(valoare);
  if (!Number.isFinite(n) || n <= 0) return null;
  const m = n / IMPARTITOR[unitate];
  if (m <= 0 || m > MAX_LATURA_M) return null;
  return m;
}

/**
 * Suprafata reala, in m², din doua laturi scrise in `unitate`.
 *
 * Exemplu: 350 x 250 cm = 3,5 x 2,5 m = 8,75 m².
 *
 * ⚠ NU se rotunjeste aici. Rotunjirea e o hotarare COMERCIALA (vezi `suprafataFacturata`), iar
 * amestecata cu conversia ar fi facut imposibil de spus, dintr-o comanda, care dintre ele a
 * schimbat cifra.
 */
export function suprafataM2(latime: unknown, inaltime: unknown, unitate: Unitate): number | null {
  const l = inMetri(latime, unitate);
  const i = inMetri(inaltime, unitate);
  if (l === null || i === null) return null;
  const aria = l * i;
  if (!Number.isFinite(aria) || aria <= 0 || aria > MAX_M2) return null;
  return aria;
}

/**
 * ⚠ Rotunjirea in SUS, fara deriva de virgula mobila.
 *
 * `Math.ceil(8.75 / 0.1) * 0.1` da 8.8 in matematica si 8.799999999999999 in JavaScript, iar
 * numarul ala ajunge pe o factura. Se socoteste in sutimi (numere intregi), si abia la final se
 * imparte inapoi.
 *
 * Scaderea lui `EPSILON` inainte de `ceil` inchide cealalta jumatate a aceleiasi probleme: o arie
 * care ar trebui sa fie exact 8,75 poate fi 8.750000000000002, iar `ceil` ar fi urcat-o inutil la
 * treapta urmatoare — clientul ar fi platit o jumatate de metru patrat pentru o eroare de calcul.
 */
function inSusLa(valoare: number, pas: number): number {
  if (!(pas > 0)) return valoare;
  const sutimiPas = Math.round(pas * 100);
  const sutimi = valoare * 100;
  const trepte = Math.ceil(sutimi / sutimiPas - Number.EPSILON * sutimi);
  return (trepte * sutimiPas) / 100;
}

/**
 * Cat se factureaza din suprafata reala.
 *
 * Doua reglaje, amandoua optionale si amandoua ale comerciantului:
 *   - `minimM2` — sub el se factureaza atat. Un fototapet de 0,7 m² se plateste ca 1 m², fiindca
 *     tiparul, taierea si ambalarea costa la fel;
 *   - `rotunjire` — in sus, la 0,01 / 0,1 / 0,5 / 1 m².
 *
 * ⚠ ORDINEA E ROTUNJIRE, APOI MINIM. Invers, un minim de 1 m² cu rotunjire la 0,5 ar fi urcat
 * orice suprafata mica la 1, apoi rotunjirea n-ar mai fi avut ce face — deci reglajul de rotunjire
 * ar fi fost mut tocmai pe produsele mici, unde conteaza cel mai mult.
 */
export function suprafataFacturata(
  aria: number,
  minimM2?: number,
  rotunjire?: Rotunjire,
): number {
  if (!Number.isFinite(aria) || aria <= 0) return 0;
  let out = rotunjire && rotunjire > 0 ? inSusLa(aria, rotunjire) : aria;
  if (minimM2 !== undefined && minimM2 > 0 && out < minimM2) out = minimM2;
  return out;
}
