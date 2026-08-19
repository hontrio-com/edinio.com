"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
        <ProductRail items={items} prioritate={prioritate} />
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
 * Banda de carduri a randului „carusel".
 *
 * Cu degetul, pe telefon, derularea nativa e tot ce trebuie. Pe desktop nu era
 * nimic: bara de derulare e ascunsa de `scrollbar-hide`, rotita mouse-ului
 * deruleaza pagina si nu banda, iar singurul semn ca mai urmeaza produse era
 * felia de card ramasa in marginea din dreapta — care se citeste mai degraba ca
 * o taietura decat ca o invitatie. De aici cele doua afordante de mouse,
 * aceleasi pe care le au deja banda de categorii si caruselul de bannere:
 * sageti de la md in sus si tragere cu mouse-ul.
 *
 * `scroll-px-4` nu tine de sageti, dar tine de acelasi rand: cu fixare
 * obligatorie, oprirea primului card se aliniaza la marginea benzii, iar banda
 * incepe cu 16px inaintea sectiunii (`-mx-4`). Randul in carusel statea deci
 * mutat un `px-4` la stanga fata de propriul antet si fata de randurile in grila
 * de deasupra si de dedesubt. Marginea de fixare readuce oprirea pe marginea
 * continutului, adica exact unde incepe titlul.
 */
function ProductRail({ items, prioritate }: { items: StorefrontProduct[]; prioritate: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const [spreStanga, setSpreStanga] = useState(false);
  const [spreDreapta, setSpreDreapta] = useState(false);
  const idBanda = useId();

  const masoara = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setSpreStanga(el.scrollLeft > 4);
    setSpreDreapta(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  // Latimea cardului e procentuala, deci cat a mai ramas de derulat se schimba la
  // fiecare redimensionare a BENZII, nu doar a ferestrei: observatorul prinde si
  // deschiderea unui sertar, si bara de derulare a paginii cand apare, si
  // schimbarea de orientare — cazuri in care `resize` pe fereastra ori nu vine,
  // ori vine cu alte dimensiuni. Fara el, sagetile ar ramane cele socotite la
  // montare.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    masoara();
    el.addEventListener("scroll", masoara, { passive: true });
    const obs = new ResizeObserver(masoara);
    obs.observe(el);
    return () => {
      el.removeEventListener("scroll", masoara);
      obs.disconnect();
    };
  }, [masoara, items.length]);

  /**
   * Un ecran de carduri, rotunjit la card intreg.
   *
   * Pasul se masoara din pozitiile reale a doua carduri vecine, nu dintr-un
   * procent scris a doua oara: latimea traieste in clase (`w-[44%] sm:w-[30%]
   * lg:w-[23%]`) si a doua copie s-ar desincroniza la prima ajustare de design.
   */
  const sari = (directie: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const copii = el.children;
    const pas = copii.length > 1
      ? (copii[1] as HTMLElement).offsetLeft - (copii[0] as HTMLElement).offsetLeft
      : el.clientWidth;
    const cate = Math.max(1, Math.floor(el.clientWidth / pas));
    el.scrollBy({ left: directie * cate * pas, behavior: "smooth" });
  };

  // Fixarea obligatorie si tragerea cu mouse-ul se bat cap in cap: fiecare
  // `scrollLeft` scris din `pointermove` e, pentru browser, o derulare incheiata,
  // deci banda se aseaza inapoi pe cel mai apropiat card in loc sa urmeze
  // cursorul. Fixarea se stinge cat tine tragerea si se reaprinde cand se ridica
  // butonul — moment in care face exact ce trebuie: aseaza banda pe card.
  const opresteTragerea = () => {
    const el = ref.current;
    if (!el || !drag.current.down) return;
    drag.current.down = false;
    el.style.scrollSnapType = "";
  };

  const sageata =
    "hidden md:flex absolute top-1/3 -translate-y-1/2 z-10 w-9 h-9 rounded-full items-center justify-center " +
    "border border-border bg-surface text-foreground shadow-md hover:bg-muted transition-colors";

  return (
    <div className="relative">
      <div
        ref={ref}
        id={idBanda}
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-4 px-4 scroll-px-4 snap-x snap-mandatory scrollbar-hide select-none md:cursor-grab"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") return;
          const el = ref.current;
          if (!el) return;
          drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
          el.style.scrollSnapType = "none";
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse" || !drag.current.down) return;
          const el = ref.current;
          if (!el) return;
          const dx = e.clientX - drag.current.startX;
          if (Math.abs(dx) > 4) drag.current.moved = true;
          el.scrollLeft = drag.current.startLeft - dx;
        }}
        onPointerUp={(e) => { if (e.pointerType === "mouse") opresteTragerea(); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") opresteTragerea(); }}
        // Tragerea porneste de pe un card, iar cardul e un link: fara oprirea
        // asta, orice tragere s-ar termina cu deschiderea unui produs.
        onClickCapture={(e) => {
          if (drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved = false; }
        }}
      >
        {items.map((product, i) => (
          <div key={product.id} className="snap-start shrink-0 w-[44%] sm:w-[30%] lg:w-[23%]">
            <StoreProductCard product={product} priority={prioritate && i < 4} />
          </div>
        ))}
      </div>

      {/* Sageata lipseste, nu se estompeaza, cand nu mai e nimic in directia ei:
          plutind peste carduri, una inactiva ar acoperi degeaba un produs. */}
      {spreStanga && (
        <button type="button" aria-label="Produsele anterioare" aria-controls={idBanda}
          onClick={() => sari(-1)} className={`${sageata} left-0`}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {spreDreapta && (
        <button type="button" aria-label="Produsele urmatoare" aria-controls={idBanda}
          onClick={() => sari(1)} className={`${sageata} right-0`}>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Sectiunea „Recomandate": produsele marcate ca populare, in grila.
 * Titlul e configurabil din editor.
 */
export function FeaturedRowClassic({ prioritate = false }: { prioritate?: boolean }) {
  const { pageContent, featuredProducts } = useStorefront();
  // ⚠ Fara a doua poarta pe `show_featured_section`. Sectiunea ajunge aici doar
  // daca e `enabled` in design, iar `enabled` se deriva chiar din flagul acela
  // cat timp editorul de design n-a spus altceva (`parse.ts`). Verificat inca o
  // data aici, flagul bloca exact cazul in care comerciantul aprindea randul din
  // editorul de design: ochiul se misca, si randul nu aparea niciodata.
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
