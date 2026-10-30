import type { StoreCategoryNode } from "@/lib/storefront/store-content.types";

/*
  Cate produse are fiecare categorie de pe primul nivel, cu tot cu subcategoriile ei: numarul de sub placile de
  categorii ale temei Jupiter (etapa 16.3 din `docs/editor-magazin/PLAN.md`), ca pe modelul ei („28100 produse”).

  Produsul isi tine categoria ca NUME (nu ca id), deci numele se cauta in arbore si se urca pe parinti pana la radacina.
  Un nume care nu e in arbore nu se numara nicaieri. Pura: o folosesc placile si probele.
*/

const cheie = (n: string) => n.trim().toLocaleLowerCase("ro");

/** Id-ul radacinii -> numarul de produse din subarborele ei. */
export function produsePeRadacina(
  arbore: readonly Pick<StoreCategoryNode, "id" | "name" | "parent_id">[],
  produse: readonly { category: string | null }[],
): Map<string, number> {
  const dupaId = new Map(arbore.map((c) => [c.id, c]));
  const dupaNume = new Map(arbore.map((c) => [cheie(c.name), c]));
  const radacina = (id: string): string | null => {
    const vazute = new Set<string>();
    let nod = dupaId.get(id);
    while (nod?.parent_id && !vazute.has(nod.id)) {
      vazute.add(nod.id);
      nod = dupaId.get(nod.parent_id);
    }
    return nod ? nod.id : null;
  };
  const numar = new Map<string, number>();
  for (const p of produse) {
    if (!p.category) continue;
    const nod = dupaNume.get(cheie(p.category));
    const r = nod ? radacina(nod.id) : null;
    if (r) numar.set(r, (numar.get(r) ?? 0) + 1);
  }
  return numar;
}

/**
 * Ce placi de categorii apar pe prima pagina si ce numar poarta fiecare.
 *
 * Cand numarul se poate scrie, apar TOATE radacinile, si cele fara produse, cu „0 produse”: vizitatorul vede ca raionul
 * e gol inainte sa apese (cererea lui, etapa 20.5: „treci 0 produse la categoriile alea”). Fara numar (`numarate` null:
 * oprit din panou, sau catalog incarcat pe server, unde pagina n-are toate produsele) raman doar cele cu produse, ca o
 * placa goala fara numar ar fi un drum infundat, nedeclarat.
 *
 * `toate` lipseste doar in miniatura din galerie: o singura lista, cu categorii de exemplu din care doar unele au produse
 * de exemplu. Acolo un 0 n-ar spune nimic despre magazin, doar ar arata designul ca pe un magazin gol, deci ramane fara numar.
 */
export function placiDeCategorii<T extends { id: string | null }>(
  cuProduse: readonly T[],
  toate: readonly T[] | undefined,
  numarate: ReadonlyMap<string, number> | null,
): { categorie: T; numar: number | null }[] {
  if (!numarate) return cuProduse.map((categorie) => ({ categorie, numar: null }));
  const faraProduse = toate ? 0 : null;
  return (toate ?? cuProduse).map((categorie) => ({
    categorie,
    numar: categorie.id ? numarate.get(categorie.id) ?? faraProduse : null,
  }));
}

/**
 * Id-ul fiecarei categorii -> produsele din subarborele ei (ea si toti descendentii). Pentru placile subcategoriilor
 * de pe pagina Magazin (etapa 16.4), unde categoria aleasa poate fi oricare, nu doar o radacina.
 */
export function produsePeCategorie(
  arbore: readonly Pick<StoreCategoryNode, "id" | "name" | "parent_id">[],
  produse: readonly { category: string | null }[],
): Map<string, number> {
  const dupaId = new Map(arbore.map((c) => [c.id, c]));
  const dupaNume = new Map(arbore.map((c) => [cheie(c.name), c]));
  const numar = new Map<string, number>();
  for (const p of produse) {
    if (!p.category) continue;
    const vazute = new Set<string>();
    let nod = dupaNume.get(cheie(p.category));
    while (nod && !vazute.has(nod.id)) {
      vazute.add(nod.id);
      numar.set(nod.id, (numar.get(nod.id) ?? 0) + 1);
      nod = nod.parent_id ? dupaId.get(nod.parent_id) : undefined;
    }
  }
  return numar;
}
