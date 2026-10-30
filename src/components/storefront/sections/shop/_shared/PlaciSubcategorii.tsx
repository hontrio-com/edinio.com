"use client";

import { useMemo } from "react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { PlacaCategorie } from "@/components/storefront/sections/catalog/CategoryNavPlaci";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { produsePeCategorie } from "@/lib/storefront/categorii-numarate";

const cheie = (n: string) => n.trim().toLocaleLowerCase("ro");

/**
 * Subcategoriile categoriei alese, pe placi, sub titlul paginii Magazin (reglajul „placiSubcategorii”, tema Jupiter,
 * etapa 16.4), ca pe pagina de categorie de pe dedeman.ro. O categorie fara subcategorii (sau nicio categorie aleasa)
 * nu arata nimic.
 */
export function PlaciSubcategorii() {
  const { categories, categoryFilter, visibleProducts, catalogPeServer, categoriiRoot, categoriiPePagina } = useStorefront();
  const aleasa = useMemo(
    () => categories.find((c) => cheie(c.name) === cheie(categoryFilter)) ?? null,
    [categories, categoryFilter],
  );
  const copii = useMemo(
    () => (aleasa ? categories.filter((c) => c.parent_id === aleasa.id).sort((a, b) => a.sort_order - b.sort_order) : []),
    [categories, aleasa],
  );
  const numarate = useMemo(
    () => (catalogPeServer || copii.length === 0 ? null : produsePeCategorie(categories, visibleProducts)),
    [catalogPeServer, copii.length, categories, visibleProducts],
  );
  if (copii.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4">
      {copii.map((c) => (
        <li key={c.id}>
          <PlacaCategorie href={hrefCategorie(categoriiRoot, c.name, categoriiPePagina === true)} nume={c.name}
            imagine={c.image_url} numar={numarate ? numarate.get(c.id) ?? 0 : null} />
        </li>
      ))}
    </ul>
  );
}
