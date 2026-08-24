/**
 * Căutarea unei categorii eMAG după nume.
 *
 * ═══ ⚠ DE CE NU E DE AJUNS POTRIVIREA AUTOMATĂ (măsurat, 24.08.2026) ═══
 *
 * `sugereazaCategorie` compară nume cu nume, pe litere. Pentru un magazin de animale,
 * rulată pe cele 13 categorii rămase nemapate, a dat:
 *
 *   „Castron"          → „Căști PC", „Căști Wireless"
 *   „Aditivi furajeri" → „Aditivi auto", „Ciment, mortar și aditivi"
 *   „Furaj complet"    → „Roți complete", „Sisteme complete"
 *   „Șampoane", „Litieră", „Lapte praf", „Concentrate" → nimic
 *
 * **Zero cu încredere mare, din treisprezece.** Comerciantul le-a ignorat, pe bună
 * dreptate, și a rămas cu 346 de produse nepublicabile.
 *
 * ⚠ Și totuși răspunsul bun ERA în listă: „Hrana pentru pisici" (#3571) e chiar
 * categoria potrivită pentru „Hrană umedă pentru pisici". Potrivirea automată doar n-a
 * fost sigură de ea.
 *
 * Deci ce lipsea nu era o potrivire mai deșteaptă, ci **căutarea**: omul știe ce vinde,
 * scrie „pisici" și alege din raftul lor. Un om cu contextul lui bate orice potrivire
 * pe litere, dacă îi dai lista.
 *
 * ═══ ⚠ CE NU FACE ═══
 *
 * Nu alege nimic singură și nu ordonează după „cât de sigură e". Întoarce ce s-a găsit,
 * cu numele lor întreg, ca omul să recunoască. O ordonare inventată de noi ar fi pus în
 * frunte tot „Căști PC", doar cu altă față.
 */

import type { EmagCategorie } from "./types";
import { categoriiIngaduite } from "./taxonomy";

export interface CategorieGasita {
  id: number;
  label: string;
}

/**
 * Textul adus la o formă în care „Șampoane" și „sampoane" sunt același lucru.
 *
 * ⚠ Diacriticele se scot ANUME. Comerciantul scrie „hrana", raftul lor scrie „Hrană"
 * — sau invers. Comparate ca atare, jumătate din căutări n-ar găsi nimic, iar omul ar
 * crede că nu există categoria.
 */
export function pentruCautare(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    /* ⚠ Și `ș`/`ț` cu virgulă vs. cu sedilă: în date apar amândouă formele. */
    .replace(/[şŞșȘ]/g, "s")
    .replace(/[ţŢțȚ]/g, "t")
    .toLowerCase()
    .trim();
}

/**
 * Categoriile în care se poate vinde și al căror nume conține TOATE cuvintele căutate.
 *
 * ⚠ Toate cuvintele, nu oricare. „hrana pisici" trebuie să dea categoriile de hrană
 * pentru pisici, nu tot ce conține „hrana" — altfel căutarea întoarce sute de rânduri
 * și nu ajută cu nimic.
 *
 * ⚠ Se caută numai în cele ÎNGĂDUITE. O categorie în care vânzătorul n-are acces arată
 * la fel în listă, dar produsele trimise acolo se resping cu o eroare de documentație —
 * adică exact ca o caracteristică lipsă, iar omul ar căuta zile întregi în datele
 * produsului o problemă care era de acces.
 */
export function cautaCategorie(
  termen: string,
  categorii: EmagCategorie[],
  limita = 25,
): CategorieGasita[] {
  const cuvinte = pentruCautare(termen).split(/\s+/).filter(Boolean);
  if (cuvinte.length === 0) return [];

  const gasite: CategorieGasita[] = [];
  for (const c of categoriiIngaduite(categorii)) {
    const nume = pentruCautare(c.label);
    if (cuvinte.every((w) => nume.includes(w))) gasite.push(c);
    if (gasite.length >= limita) break;
  }
  return gasite;
}
