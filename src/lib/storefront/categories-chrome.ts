import type { CategoryItem } from "@/components/storefront/StorefrontProvider";
import type { StoreCategoryNode } from "@/lib/storefront/store-content.types";

/**
 * Arborele de categorii, taiat pe nivele pentru header, hero si meniul de pe
 * telefon.
 *
 * Pagina de catalog isi construieste singura arborele, din categoriile
 * intersectate cu produsele vizibile — acolo o categorie fara niciun produs n-are
 * ce cauta in filtre. Aici, pe paginile fara catalog, produsele nu sunt
 * incarcate, deci arborele e cel din tabel, netaiat. Diferenta e deliberata: o
 * categorie goala aratata intr-un meniu duce la un catalog gol, ceea ce e
 * suparator, dar ascunsa din meniu ar face navigarea sa se schimbe de la o
 * pagina la alta, ceea ce e mai rau.
 */

function catreElement(c: StoreCategoryNode, areCopii: boolean): CategoryItem {
  return { key: c.id, id: c.id, name: c.name, image: c.image_url, hasChildren: areCopii };
}

/** Categoriile de nivel intai. */
export function radaciniCategorii(arbore: StoreCategoryNode[] | undefined): CategoryItem[] {
  if (!arbore?.length) return [];
  const areCopii = new Set(arbore.map((c) => c.parent_id).filter(Boolean) as string[]);
  return arbore
    .filter((c) => !c.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => catreElement(c, areCopii.has(c.id)));
}

/** Copiii directi ai unei categorii. */
export function subcategorii(arbore: StoreCategoryNode[] | undefined, parintId: string | null): CategoryItem[] {
  if (!arbore?.length || !parintId) return [];
  const areCopii = new Set(arbore.map((c) => c.parent_id).filter(Boolean) as string[]);
  return arbore
    .filter((c) => c.parent_id === parintId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => catreElement(c, areCopii.has(c.id)));
}

/** Doar numele radacinilor, pentru selectoarele care nu au nevoie de mai mult. */
export function numeRadacini(arbore: StoreCategoryNode[] | undefined): string[] {
  return radaciniCategorii(arbore).map((c) => c.name);
}
