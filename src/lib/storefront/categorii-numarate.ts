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
