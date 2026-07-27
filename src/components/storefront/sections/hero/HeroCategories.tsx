"use client";

import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { MIN_CATEGORII_HERO_SIDEBAR } from "@/lib/storefront/design/registry";
import { useStoreChrome, useStorefrontOptional } from "@/components/storefront/StorefrontProvider";
import { BannerSlider } from "./HeroBanners";

/** Cate categorii se arata implicit. */
const MAX_IMPLICIT = 10;

/**
 * Hero cu bara de categorii la stanga si bannere la dreapta.
 *
 * Asezarea marilor magazine: vizitatorul are dintr-o privire si intreg raftul,
 * si oferta zilei. Inaltimea o da lista de categorii, iar bannerele o umplu —
 * de aceea varianta cere un numar minim de categorii: cu doua-trei, bara ar fi
 * un ciot langa o imagine mare.
 *
 * Daca magazinul scade sub prag dupa ce varianta a fost aleasa (categorii
 * sterse), hero-ul ramane doar cu bannerele in loc sa arate strambatura.
 */
export function HeroCategories({ settings }: { settings: Record<string, unknown> }) {
  const { business, basePath, pageContent } = useStoreChrome();
  const catalog = useStorefrontOptional();

  const nume = business.store_name ?? business.business_name;
  const { banners, links } = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url);

  const maxim = typeof settings.maxCategories === "number" ? settings.maxCategories : MAX_IMPLICIT;
  const toate = catalog?.rootCategoryItems ?? [];
  const categorii = toate.slice(0, maxim);
  const areBara = toate.length >= MIN_CATEGORII_HERO_SIDEBAR;

  if (banners.length === 0 && !areBara) return null;

  return (
    <section className="pt-4 md:pt-6">
      <h1 className="sr-only">
        {nume}
        {business.tagline ? ` - ${business.tagline}` : ""}
      </h1>

      <div className="mx-auto max-w-6xl px-0 md:px-4">
        <div className={areBara ? "lg:grid lg:grid-cols-[236px_1fr] lg:gap-4" : ""}>
          {areBara && (
            <nav aria-label="Categorii" className="hidden lg:flex flex-col rounded-2xl border border-[var(--st-border)] bg-[var(--st-surface)] overflow-hidden py-1.5">
              {categorii.map((c) => (
                <Rand key={c.key} nume={c.name} imagine={c.image} basePath={basePath}
                  onAlege={catalog ? () => catalog.selectCategoryItem(c) : undefined} />
              ))}
            </nav>
          )}

          {banners.length > 0 && (
            <BannerSlider
              banners={banners}
              links={links}
              alt={nume}
              basePath={basePath}
              wrapperClass="relative md:rounded-2xl md:overflow-hidden h-full"
              // Pe telefon raportul fix tine locul imaginii; pe desktop
              // inaltimea vine din coloana cu categorii, ca cele doua sa se
              // termine la aceeasi linie.
              slideClass="aspect-[16/9] lg:aspect-auto lg:h-full"
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** Un rand din bara: imaginea categoriei daca exista, altfel initiala ei. */
function Rand({
  nume,
  imagine,
  basePath,
  onAlege,
}: {
  nume: string;
  imagine: string | null;
  basePath: string;
  onAlege?: () => void;
}) {
  const continut = (
    <>
      {imagine ? (
        <span className="relative w-6 h-6 rounded-md overflow-hidden shrink-0 bg-[var(--st-bg)]">
          <Image src={imagine} alt="" fill sizes="24px" className="object-cover" />
        </span>
      ) : (
        <span className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-[11px] font-bold"
          style={{ backgroundColor: "var(--st-primary-soft)", color: "var(--st-primary)" }}>
          {nume[0]?.toUpperCase()}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate text-sm text-[var(--st-text)]">{nume}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--st-muted)]" strokeWidth={1.7} />
    </>
  );

  const cls = "flex items-center gap-2.5 h-11 px-3.5 hover:bg-[var(--st-primary-soft)] transition-colors text-left";

  // Pe pagina de magazin filtreaza pe loc; miniatura din galerie n-are catalog.
  return onAlege ? (
    <button type="button" onClick={onAlege} className={cls}>{continut}</button>
  ) : (
    <a href={`${basePath}/?cat=${encodeURIComponent(nume)}`} className={cls}>{continut}</a>
  );
}
