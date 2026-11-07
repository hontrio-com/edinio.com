"use client";

import { useMemo } from "react";
import Image from "next/image";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { placiDeCategorii, produsePeRadacina } from "@/lib/storefront/categorii-numarate";
import { TITLU_SECTIUNE } from "@/components/storefront/sections/_shared/aspect-jupiter";

const TONURI = {
  accent: { fond: "var(--st-accent)", scris: "var(--st-accent-contrast)" },
  principala: { fond: "var(--st-primary)", scris: "var(--st-primary-contrast)" },
  deschis: { fond: "color-mix(in srgb, var(--st-primary) 9%, var(--st-surface))", scris: "var(--st-text)" },
} as const;

/**
 * Categoriile pe placi colorate, varianta „colorate” (tema Mercur, etapa 24 din `docs/editor-magazin/PLAN.md`, dupa
 * Woodmart Pets): numele mare si numarul de produse sus, in stanga, poza categoriei mare, jos in dreapta, pe o placa in
 * culoarea de accent (sau principala, sau o nuanta deschisa). Patru pe rand pe calculator, doua pe telefon.
 *
 * Ce placi apar si ce numar scriu: aceleasi reguli ca la „placi” (`placiDeCategorii`, numarul din produsele care chiar
 * se vad; pe catalogul de pe server, fara numar).
 */
export function CategoryNavColorate({ settings }: { settings: Record<string, unknown> }) {
  const { rootCategoryItems, rootCategoryItemsToate, categories, visibleProducts, catalogPeServer, categoriiRoot, categoriiPePagina } = useStorefront();
  const arataNumarul = settings.arataNumarul !== false;
  const placi = useMemo(
    () => placiDeCategorii(rootCategoryItems, rootCategoryItemsToate,
      arataNumarul && !catalogPeServer ? produsePeRadacina(categories, visibleProducts) : null),
    [rootCategoryItems, rootCategoryItemsToate, arataNumarul, catalogPeServer, categories, visibleProducts],
  );
  if (placi.length === 0) return null;
  const titlu = typeof settings.titlu === "string" && settings.titlu.trim() ? settings.titlu.trim() : "Categorii";
  const ton = TONURI[settings.fond === "principala" ? "principala" : settings.fond === "deschis" ? "deschis" : "accent"];

  return (
    <section className="mb-12">
      <h2 className={TITLU_SECTIUNE} style={{ fontFamily: "var(--st-font-heading)" }}>{titlu}</h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-5">
        {placi.map(({ categorie: c, numar }) => (
          <li key={c.key}>
            <a href={hrefCategorie(categoriiRoot, c.name, categoriiPePagina === true)}
              className="group relative isolate flex flex-col overflow-hidden rounded-[var(--st-radius-lg)] p-4 sm:p-6 aspect-[4/4.3] sm:aspect-[4/3.4] hover:-translate-y-1 hover:shadow-[0_18px_34px_-14px_rgba(0,0,0,0.35)] transition-[transform,box-shadow] duration-300"
              style={{ backgroundColor: ton.fond, color: ton.scris }}>
              <span aria-hidden className="absolute -z-10 -right-10 -bottom-10 w-48 h-48 rounded-full bg-white/[0.14]" />
              <span className="flex items-start gap-2">
                <span className="text-[18px] sm:text-[24px] font-extrabold leading-tight tracking-tight" style={{ fontFamily: "var(--st-font-heading)" }}>
                  {c.name}
                </span>
                {numar !== null && numar > 0 && (
                  <span className="mt-1 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums bg-white/85 text-[#1B1F3B]">{numar}</span>
                )}
              </span>
              {c.image && (
                <span className="absolute right-1 bottom-1 sm:right-2 sm:bottom-2 w-[80%] h-[72%]">
                  <Image src={c.image} alt="" fill sizes="(max-width: 640px) 35vw, 200px"
                    className="object-contain object-right-bottom drop-shadow-[0_10px_16px_rgba(0,0,0,0.18)] group-hover:scale-[1.06] origin-bottom-right transition-transform duration-500" />
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
