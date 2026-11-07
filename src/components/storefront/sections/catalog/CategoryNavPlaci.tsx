"use client";

import { useMemo } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { placiDeCategorii, produsePeRadacina } from "@/lib/storefront/categorii-numarate";
import { pluralRo } from "@/lib/utils/format";
import { FOND_PLACA as FOND_POZA, TITLU_SECTIUNE } from "@/components/storefront/sections/_shared/aspect-jupiter";

/**
 * O placa de categorie (etapa 23: verticala, nu ca pe modelul temei): poza pe o placa deschisa, rotunjita, numele si
 * numarul de produse dedesubt, iar sub mouse placa se ridica si apare sageata. Comuna placilor de pe prima pagina si
 * subcategoriilor de pe pagina Magazin (etapa 16.4), ca sa nu fie doua copii ale aceleiasi placi.
 */
export function PlacaCategorie({ href, nume, imagine, numar }: { href: string; nume: string; imagine: string | null; numar: number | null }) {
  return (
    <a href={href}
      className="group h-full flex flex-col p-2 sm:p-2.5 rounded-[var(--st-radius-lg)] border border-[var(--st-border)] bg-[var(--st-surface)] hover:border-transparent hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-12px_rgba(16,24,40,0.22)] transition-[transform,box-shadow,border-color] duration-300">
      <span className="relative block aspect-[4/3] rounded-[var(--st-radius)] overflow-hidden" style={{ backgroundColor: FOND_POZA }}>
        {imagine && <Image src={imagine} alt="" fill sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 240px" className="object-contain p-3 mix-blend-multiply group-hover:scale-[1.05] transition-transform duration-500" />}
      </span>
      <span className="flex items-center gap-2 px-1.5 pt-3 pb-1.5">
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] sm:text-[15px] font-semibold leading-snug text-[var(--st-text)] group-hover:text-[var(--st-primary)] transition-colors line-clamp-2">
            {nume}
          </span>
          {numar !== null && (
            <span className="block mt-0.5 text-[12.5px] text-[var(--st-muted)]">{pluralRo(numar)}</span>
          )}
        </span>
        <span aria-hidden className="hidden sm:flex w-8 h-8 shrink-0 rounded-full items-center justify-center bg-[var(--st-primary-soft)] text-[var(--st-primary)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-300">
          <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
        </span>
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
    <section className="mb-12">
      <h2 className={TITLU_SECTIUNE} style={{ fontFamily: "var(--st-font-heading)" }}>{titlu}</h2>
      {/* Pana la opt categorii, patru pe rand (doua randuri pline); peste, sase (Jupiter are 12): altfel ramanea un rand cu doua. */}
      <ul className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 ${placi.length > 8 ? "xl:grid-cols-6" : ""} gap-3 lg:gap-4`}>
        {placi.map(({ categorie: c, numar }) => (
          <li key={c.key}>
            <PlacaCategorie href={hrefCategorie(categoriiRoot, c.name, categoriiPePagina === true)} nume={c.name} imagine={c.image} numar={numar} />
          </li>
        ))}
      </ul>
    </section>
  );
}
