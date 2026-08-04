"use client";

import { ChevronRight } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import { StoreProductCard } from "./StoreProductCard";

/**
 * Un rand de produse deasupra catalogului, varianta classic.
 *
 * Doua asezari, cu acelasi antet: grila de patru pe desktop, sau derulare
 * orizontala cu fixare la card. Asezarea vine din editorul magazinului, nu din
 * sistemul de design: randul n-are inca design-uri proprii.
 */
export function ProductRowClassic({
  title,
  items,
  layout = "grid",
  onViewAll,
  headerGap = "gap-2",
  prioritate = false,
}: {
  title: string;
  items: StorefrontProduct[];
  layout?: "grid" | "carousel";
  /** Prima sectiune a paginii: primele carduri isi incarca imaginea nerabdator. */
  prioritate?: boolean;
  onViewAll?: () => void;
  /**
   * Spatierea din antet difera intre cele doua randuri de azi, din motive
   * istorice: „Recomandate" foloseste gap-2, randurile curate gap-3, indiferent
   * daca au sau nu buton. Se primeste ca prop pentru a pastra randarea exacta;
   * se unifica atunci cand desenam variantele de rand.
   */
  headerGap?: "gap-2" | "gap-3";
}) {
  const { color } = useStorefront();
  if (items.length === 0) return null;

  return (
    <section className="mb-12">
      <div className={`flex items-center ${headerGap} mb-4`}>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <div className="h-px flex-1 bg-border" />
        {onViewAll && (
          <button type="button" onClick={onViewAll}
            className="flex items-center gap-1 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-70"
            style={{ color }}>
            Vezi toate
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {layout === "carousel" ? (
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
          {items.map((product, i) => (
            <div key={product.id} className="snap-start shrink-0 w-[44%] sm:w-[30%] lg:w-[23%]">
              <StoreProductCard product={product} priority={prioritate && i < 4} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {items.map((product, i) => (
            <StoreProductCard key={product.id} product={product} priority={prioritate && i < 4} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Sectiunea „Recomandate": produsele marcate ca populare, in grila.
 * Titlul e configurabil din editor.
 */
export function FeaturedRowClassic({ prioritate = false }: { prioritate?: boolean }) {
  const { pageContent, featuredProducts } = useStorefront();
  if (pageContent.show_featured_section !== true) return null;

  return (
    <ProductRowClassic
      title={pageContent.featured_section_title || "Recomandate"}
      items={featuredProducts}
      prioritate={prioritate}
    />
  );
}

/**
 * Un rand curat de comerciant din editor, identificat prin id-ul lui.
 *
 * Fiecare rand e o sectiune de sine statatoare, ca sa poata fi mutata
 * independent in lista de sectiuni. Produsele vin din lista deja incarcata;
 * randurile fara produse sunt deja eliminate din context, deci lipsa lui aici
 * inseamna „nimic de afisat".
 */
export function CustomProductRow({ sectionId, prioritate = false }: { sectionId: string; prioritate?: boolean }) {
  const { productSections, viewAllCategory } = useStorefront();
  const rand = productSections.find((x) => x.section.id === sectionId);
  if (!rand) return null;

  const { section, items } = rand;
  return (
    <ProductRowClassic
      title={section.title || "Produse"}
      items={items}
      prioritate={prioritate}
      layout={section.layout === "carousel" ? "carousel" : "grid"}
      headerGap="gap-3"
      onViewAll={
        section.mode === "category" && section.category
          ? () => viewAllCategory(section.category!)
          : undefined
      }
    />
  );
}
