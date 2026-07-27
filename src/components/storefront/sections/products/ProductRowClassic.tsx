"use client";

import { useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import { StoreProductCard } from "./StoreProductCard";

/**
 * Un rand de produse deasupra catalogului, varianta classic.
 *
 * Doua asezari, cu acelasi antet: grila de patru pe desktop, sau derulare
 * orizontala cu fixare la card. Aici incepe familia de variante de „carusel",
 * deci antetul si cardurile stau in acelasi loc pentru toate.
 */
/** Asezarile posibile ale unui rand de produse, dupa id-ul variantei din registry. */
export type LayoutRand = "grid" | "carousel" | "peek" | "showcase" | "compact";

export function ProductRowClassic({
  title,
  items,
  layout = "grid",
  onViewAll,
  headerGap = "gap-2",
}: {
  title: string;
  items: StorefrontProduct[];
  layout?: LayoutRand;
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
          {items.map((product) => (
            <div key={product.id} className="snap-start shrink-0 w-[44%] sm:w-[30%] lg:w-[23%]">
              <StoreProductCard product={product} />
            </div>
          ))}
        </div>
      ) : layout === "peek" ? (
        <CarusetCuSageti items={items} />
      ) : layout === "showcase" ? (
        <Vitrina items={items} />
      ) : layout === "compact" ? (
        <ListaCompacta items={items} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {items.map((product) => (
            <StoreProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Carusel cu sageti si card taiat la margine.
 *
 * Al cincilea card se vede pe jumatate, ca sa se stie ca randul continua.
 * Derularea prin sageti muta exact o latime de card: fara reper, un carusel care
 * sare aleator dezorienteaza.
 */
function CarusetCuSageti({ items }: { items: StorefrontProduct[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const muta = (directie: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.firstElementChild?.getBoundingClientRect().width ?? el.clientWidth / 4;
    el.scrollBy({ left: directie * (card + 16), behavior: "smooth" });
  };

  const sageata =
    "hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full items-center justify-center bg-[var(--st-surface)] border border-[var(--st-border)] shadow-md hover:bg-[var(--st-primary-soft)] transition-colors";

  return (
    <div className="relative">
      <div ref={ref} className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x scrollbar-hide">
        {items.map((product) => (
          <div key={product.id} className="snap-start shrink-0 w-[62%] sm:w-[38%] lg:w-[22.5%]">
            <StoreProductCard product={product} />
          </div>
        ))}
      </div>
      <button type="button" aria-label="Produsele anterioare" onClick={() => muta(-1)} className={`${sageata} -left-3`}>
        <ChevronLeft className="h-5 w-5 text-[var(--st-text)]" />
      </button>
      <button type="button" aria-label="Produsele urmatoare" onClick={() => muta(1)} className={`${sageata} -right-3`}>
        <ChevronRight className="h-5 w-5 text-[var(--st-text)]" />
      </button>
    </div>
  );
}

/**
 * Vitrina: primul produs mare, restul in jurul lui.
 *
 * Pe telefon ierarhia dispare si toate devin egale — pe un ecran ingust, un card
 * dublu ar impinge restul randului sub linia de plutire.
 */
function Vitrina({ items }: { items: StorefrontProduct[] }) {
  const [primul, ...restul] = items;
  if (!primul) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <div className="col-span-2 row-span-2">
        <StoreProductCard product={primul} priority />
      </div>
      {restul.slice(0, 4).map((product) => (
        <StoreProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

/**
 * Lista compacta: imagine mica la stanga, nume si pret la dreapta.
 *
 * Incape de doua ori mai multe produse in aceeasi inaltime — potrivita
 * magazinelor unde conteaza pretul si numele, nu fotografia mare.
 */
function ListaCompacta({ items }: { items: StorefrontProduct[] }) {
  const { color, basePath } = useStorefront();

  return (
    <div className="grid sm:grid-cols-2 gap-2 sm:gap-3">
      {items.map((product) => {
        const vechi = product.compare_at_price;
        const redus = typeof vechi === "number" && vechi > product.price;
        // `images` e jsonb, deci vine ca `Json`; aceeasi citire ca in ProductCard.
        const imagini = Array.isArray(product.images) ? product.images : [];
        const imagine = imagini[0] ? String(imagini[0]) : null;
        return (
          <a key={product.id} href={`${basePath}/product/${product.slug}`}
            className="flex items-center gap-3 p-2 rounded-[var(--st-radius)] border border-border bg-surface hover:shadow-md transition-shadow">
            <span className="relative w-20 h-20 shrink-0 rounded-[var(--st-radius-sm)] overflow-hidden bg-muted">
              {imagine && (
                <Image src={imagine} alt={product.name} fill sizes="80px" className="object-cover" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground line-clamp-2">{product.name}</span>
              <span className="mt-1 flex items-baseline gap-2">
                <span className="text-base font-bold" style={{ color }}>{formatPrice(product.price)}</span>
                {redus && (
                  <span className="text-xs text-muted-foreground line-through">{formatPrice(vechi)}</span>
                )}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </a>
        );
      })}
    </div>
  );
}

/**
 * Sectiunea „Recomandate": produsele marcate ca populare, in grila.
 * Titlul e configurabil din editor.
 */
export function FeaturedRowClassic({ layout = "grid" }: { layout?: LayoutRand }) {
  const { pageContent, featuredProducts } = useStorefront();
  if (pageContent.show_featured_section !== true) return null;

  return (
    <ProductRowClassic
      title={pageContent.featured_section_title || "Recomandate"}
      items={featuredProducts}
      layout={layout}
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
export function CustomProductRow({ sectionId, layout }: { sectionId: string; layout?: LayoutRand }) {
  const { productSections, viewAllCategory } = useStorefront();
  const rand = productSections.find((x) => x.section.id === sectionId);
  if (!rand) return null;

  const { section, items } = rand;
  return (
    <ProductRowClassic
      title={section.title || "Produse"}
      items={items}
      layout={layout ?? (section.layout === "carousel" ? "carousel" : "grid")}
      headerGap="gap-3"
      onViewAll={
        section.mode === "category" && section.category
          ? () => viewAllCategory(section.category!)
          : undefined
      }
    />
  );
}
