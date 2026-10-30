"use client";

import { useMemo } from "react";
import Image from "next/image";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { placiDeCategorii, produsePeRadacina } from "@/lib/storefront/categorii-numarate";
import { pluralRo } from "@/lib/utils/format";

/** Fondul placilor: aceeasi tenta ca banda randurilor de produse si cardurile bannerului. */
const GRI = "color-mix(in srgb, var(--st-primary) 4%, var(--st-bg))";

/**
 * O placa de categorie: imaginea, numele cu sageata in culoarea de accent, numarul de produse. Comuna placilor de pe
 * prima pagina si subcategoriilor de pe pagina Magazin (etapa 16.4), ca sa nu fie doua copii ale aceleiasi placi.
 */
export function PlacaCategorie({ href, nume, imagine, numar }: { href: string; nume: string; imagine: string | null; numar: number | null }) {
  return (
    <a href={href}
      className="group h-full min-h-[84px] lg:min-h-[104px] flex items-center gap-2.5 sm:gap-4 p-2.5 sm:p-3.5 rounded-[3px] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-shadow"
      style={{ backgroundColor: GRI }}>
      {imagine && (
        <span className="relative w-12 h-12 sm:w-20 sm:h-20 shrink-0">
          <Image src={imagine} alt="" fill sizes="80px" className="object-contain" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[13px] sm:text-[15px] leading-snug text-[var(--st-text)] group-hover:text-[var(--st-primary)] transition-colors">
          {nume}
          <span aria-hidden className="ml-1 font-semibold" style={{ color: "var(--st-accent)" }}>›</span>
        </span>
        {numar !== null && (
          <span className="block mt-1 text-[12px] text-[var(--st-muted)]">{pluralRo(numar)}</span>
        )}
      </span>
    </a>
  );
}

/**
 * Categoriile pe placi, varianta „placi” a navigarii pe categorii (tema Jupiter, etapa 16.3), dupa dedeman.ro: patru
 * pe rand, fiecare cu imaginea in stanga, numele cu sageata in culoarea de accent si numarul de produse dedesubt.
 *
 * Numarul se socoteste din produsele pe care vizitatorul le gaseste chiar (`visibleProducts`): numarate din lista
 * intreaga, un raion cu produse ascunse ar fi scris „3 produse” si ar fi dus la o pagina goala. La un catalog incarcat
 * pe server (magazinele foarte mari) pagina nu are toate produsele, deci placile apar fara numar, nu cu unul gresit.
 * Ce placi apar: `placiDeCategorii`.
 */
export function CategoryNavPlaci({ settings }: { settings: Record<string, unknown> }) {
  const { rootCategoryItems, rootCategoryItemsToate, categories, visibleProducts, catalogPeServer, categoriiRoot, categoriiPePagina } = useStorefront();
  const arataNumarul = settings.arataNumarul !== false;
  const placi = useMemo(
    () => placiDeCategorii(rootCategoryItems, rootCategoryItemsToate,
      arataNumarul && !catalogPeServer ? produsePeRadacina(categories, visibleProducts) : null),
    [rootCategoryItems, rootCategoryItemsToate, arataNumarul, catalogPeServer, categories, visibleProducts],
  );
  if (placi.length === 0) return null;
  const titlu = typeof settings.titlu === "string" && settings.titlu.trim() ? settings.titlu.trim() : "Categorii";

  return (
    <section className="mb-10">
      <h2 className="text-[24px] leading-tight text-[var(--st-text)] mb-4" style={{ fontFamily: "var(--st-font-heading)" }}>{titlu}</h2>
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4">
        {placi.map(({ categorie: c, numar }) => (
          <li key={c.key}>
            <PlacaCategorie href={hrefCategorie(categoriiRoot, c.name, categoriiPePagina === true)} nume={c.name} imagine={c.image} numar={numar} />
          </li>
        ))}
      </ul>
    </section>
  );
}
