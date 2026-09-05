/**
 * Ce primeste vitrina, si ce NU primeste.
 *
 * ═══ ⚠ DEFINITIA BRUTA NU PLEACA NICIODATA LA CUMPARATOR ═══
 *
 * Pagina de produs e „use client", iar React serializeaza props-urile de client in HTML. Deci
 * tot ce ii dam ajunge, litera cu litera, in sursa paginii — vizibil oricui. Randul intreg
 * `products` face deja asta, si e chiar motivul pentru care configuratorul NU sta in
 * `page_sections`.
 *
 * Aici se compune, la PUBLICARE, exact ce are nevoie vitrina ca sa deseneze si sa socoteasca —
 * si nimic mai mult. Ce ramane pe server:
 *
 *   - ciornele si versiunile vechi;
 *   - costul intern al componentelor (`componenta.bucati` ramane, pretul de achizitie nu);
 *   - notele si metadatele de panou;
 *   - regulile stinse, care n-ar face nimic dar ar arata comerciantului cum gandeste.
 *
 * ═══ ⚠ SE COMPILEAZA O SINGURA DATA, LA PUBLICARE ═══
 *
 * Nu la fiecare cerere. Versiunea publicata e imutabila, deci si ce iese de aici e imutabil —
 * si atunci n-are rost recalculat, si nici n-are voie sa iasa altfel maine decat azi. Rezultatul
 * se scrie in `configurator_versiuni.compilat` si de acolo se serveste.
 */

import type { Definitie, Nod, Optiune } from "./definitie";
import type { Regula } from "./reguli";
import type { Pretuire } from "./pret";

/** Versiunea FORMEI compilate. Se schimba doar cand se schimba forma, nu continutul. */
export const VERSIUNE_COMPILAT = 1;

export interface Compilat {
  v: number;
  definitie: Definitie;
  reguli: Regula[];
  pretuire: Pretuire;
}

/**
 * Optiunea, curatata de ce tine numai de panou.
 *
 * ⚠ `componenta` se pastreaza fara pretul ei: vitrina trebuie sa stie CATE bucati consuma
 * alegerea, ca sa poata arata „mai sunt 3 in stoc", dar nu are ce face cu cat ne costa pe noi.
 * Costul intern e date de afacere ale comerciantului, si n-are ce cauta in sursa unei pagini.
 */
function optiunePentruVitrina(o: Optiune): Optiune {
  const out: Optiune = { id: o.id, eticheta: o.eticheta };
  if (o.descriere) out.descriere = o.descriere;
  if (o.culoare) out.culoare = o.culoare;
  if (o.imagine) out.imagine = o.imagine;
  if (o.pret !== undefined) out.pret = o.pret;
  if (o.grame !== undefined) out.grame = o.grame;
  if (o.componenta) out.componenta = { id: o.componenta.id, bucati: o.componenta.bucati };
  if (o.activa === false) out.activa = false;
  return out;
}

function nodPentruVitrina(n: Nod): Nod {
  if (n.fel !== "alegere" && n.fel !== "alegeri") return n;
  return { ...n, optiuni: (n.optiuni ?? []).map(optiunePentruVitrina) };
}

/**
 * Definitia publicata, gata de servit.
 *
 * ⚠ Regulile STINSE nu pleaca. N-ar face nimic — motorul le sare oricum — dar i-ar arata
 * oricui deschide sursa paginii ce a incercat comerciantul si a renuntat. Iar la o mie de
 * cereri pe zi, sunt octeti platiti degeaba.
 */
export function compileaza(
  definitie: Definitie,
  reguli: Regula[],
  pretuire: Pretuire,
): Compilat {
  return {
    v: VERSIUNE_COMPILAT,
    definitie: {
      ...definitie,
      pasi: (definitie.pasi ?? []).map((p) => ({
        ...p,
        grupuri: (p.grupuri ?? []).map((g) => ({ ...g, noduri: (g.noduri ?? []).map(nodPentruVitrina) })),
      })),
    },
    reguli: (reguli ?? []).filter((r) => r.activa !== false),
    pretuire,
  };
}

/**
 * Ce s-a compilat, citit inapoi din coloana.
 *
 * ⚠ Forma NECUNOSCUTA se refuza, nu se ghiceste. O versiune compilata de un cod mai nou decat
 * cel care o citeste nu se poate servi pe jumatate: mai bine produsul se arata fara configurator
 * si cineva vede ca ceva nu e in regula, decat sa se vanda dupa reguli intelese partial.
 */
export function citesteCompilat(brut: unknown): Compilat | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  if (o.v !== VERSIUNE_COMPILAT) return null;
  if (!o.definitie || typeof o.definitie !== "object") return null;
  return {
    v: VERSIUNE_COMPILAT,
    definitie: o.definitie as Definitie,
    reguli: Array.isArray(o.reguli) ? (o.reguli as Regula[]) : [],
    pretuire: (o.pretuire ?? {}) as Pretuire,
  };
}
