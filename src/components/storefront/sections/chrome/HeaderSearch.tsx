"use client";

import { Fragment, useRef, useState } from "react";
import { numeRadacini } from "@/lib/storefront/categories-chrome";
import { ChevronDown, Search, ShoppingBag } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { formatPrice, whatsappLink } from "@/lib/utils/format";
import { StoreNavHamburger, StoreNavLinks } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useCatalogCautabil, useStoreChrome, useStorefrontOptional, type CartMode } from "@/components/storefront/StorefrontProvider";
import { useHeaderSettings } from "@/components/storefront/sections/_shared/header-settings";
import { CartControl } from "@/components/storefront/sections/_shared/CartControl";
import { HEADER_VARIANT_ACTIONS } from "@/lib/storefront/design/registry";
import { useCautareHeader } from "@/components/storefront/sections/_shared/cautare";

/**
 * Header cu bara de cautare, varianta „search".
 *
 * Desktop: logo la stanga, o bara larga de cautare cu selector de categorie in
 * mijloc, contact si cos la dreapta. Mobil: hamburger, logo centrat, cos —
 * cautarea coboara pe un rand propriu, ca sa ramana utilizabila.
 *
 * Cautarea se comporta dupa pagina: pe magazin filtreaza pe loc, fara navigare,
 * pentru ca acolo catalogul e deja in browser. De oriunde altundeva duce la
 * magazin cu termenul in adresa (`?q=`), iar pagina porneste cu el aplicat.
 */
export function HeaderSearch({ settings }: { settings: Record<string, unknown> }) {
  const {
    business,
    basePath,
    menu,
    pageContent,
    hasAnnouncementBar,
    cartMode,
    currentPageSlug,
    searchCategories,
    isHome,
  } = useStoreChrome();
  const { count, total } = useCart();
  const catalog = useStorefrontOptional();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.logo_size ?? 36;
  const acasa = isHome ? "#" : `${basePath}/`;

  const { actiuni, meniuCls, meniuStyle } = useHeaderSettings(settings, HEADER_VARIANT_ACTIONS.search);

  // Radacinile, nu categoria curenta: selectorul de langa cautare nu are cale de
  // intoarcere, deci o lista care se schimba la fiecare drill lasa vizitatorul
  // blocat in subarbore. Pe paginile fara catalog sunt oricum radacinile.
  const categorii = catalog
    ? catalog.rootCategoryItems.map((c) => c.name)
    : numeRadacini(searchCategories);

  return (
    <header className={`sticky ${hasAnnouncementBar ? "top-9" : "top-0"} z-30 bg-[var(--st-surface)]/95 backdrop-blur-md border-b border-[var(--st-border)]`}>
      <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
        {/* Randul principal */}
        <div className="h-16 flex items-center gap-3 lg:gap-6">
          <div className="lg:hidden">
            <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} panaLa="lg" />
          </div>

          {/* Fara logo, ancora trebuie sa se poata stramta: intr-un `shrink-0`
              `truncate` n-are de unde taia si un nume lung latfeste randul. */}
          {business.logo_url ? (
            <a href={acasa} className="flex items-center min-w-0 hover:opacity-80 transition-opacity" aria-label={nume}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cdnImage(business.logo_url, 480)} alt={nume}
                style={{ height: logoSize, maxWidth: logoSize * 5 }}
                className="w-auto max-w-full object-contain" />
            </a>
          ) : (
            <a href={acasa} className="flex items-center min-w-0 hover:opacity-80 transition-opacity" aria-label={nume}>
              <span className="text-lg font-black tracking-tight text-[var(--st-text)] truncate">{nume}</span>
            </a>
          )}

          {/* Cautarea, pe randul principal doar de la lg in sus. */}
          <div className="hidden lg:block flex-1 min-w-0">
            <SearchBar categorii={categorii} />
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
            {actiuni.map((a) => (
              <Fragment key={a}>
                {a === "telefon" && (
                  <a href={`tel:${business.phone}`} aria-label="Suna"
                    className="hidden sm:flex w-10 h-10 rounded-full items-center justify-center transition-opacity hover:opacity-80"
                    style={{ backgroundColor: "var(--st-primary-soft)", color: "var(--st-primary)" }}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                    </svg>
                  </a>
                )}
                {a === "whatsapp" && (
                  <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
                    className="hidden sm:flex w-10 h-10 rounded-full items-center justify-center transition-opacity hover:opacity-80"
                    style={{ backgroundColor: "rgba(37, 211, 102, 0.12)", color: "#25D366" }}>
                    <svg viewBox="0 0 448 512" className="h-4 w-4" fill="currentColor">
                      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                    </svg>
                  </a>
                )}

                {a === "cos" && <Cos mode={cartMode} count={count} total={total} />}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Meniul, sub randul principal pe desktop. */}
        {menu.length > 0 && (
          <div className="hidden lg:flex items-center h-11 border-t border-[var(--st-border)]" style={meniuStyle}>
            <StoreNavLinks items={menu} basePath={basePath} color="var(--st-primary)" currentSlug={currentPageSlug} className={meniuCls} />
          </div>
        )}
      </div>

      {/* Pe mobil cautarea are randul ei: intr-o bara de 16 unitati n-ar mai incapea nimic. */}
      <div className="lg:hidden px-4 pb-3">
        <SearchBar categorii={categorii} compact />
      </div>
    </header>
  );
}

/**
 * Caseta de cautare cu selector de categorie.
 *
 * Cand exista catalog (pagina de magazin) scrisul filtreaza pe loc, fara
 * navigare si fara reincarcare. In rest, trimiterea formularului duce la magazin
 * cu termenul in adresa.
 */
function SearchBar({
  categorii,
  compact = false,
}: {
  categorii: string[];
  compact?: boolean;
}) {
  const catalog = useCatalogCautabil();
  const [catLocal, setCatLocal] = useState("toate");
  const [deschis, setDeschis] = useState(false);
  const inchide = useRef<number | null>(null);

  const categorie = catalog ? catalog.categoryFilter : catLocal;
  const { valoare, scrie, propsForm, rezultate } = useCautareHeader({ categorie });

  function alegeCategorie(nume: string) {
    setDeschis(false);
    if (catalog) {
      if (nume === "toate") catalog.resetCategory();
      else catalog.selectCategoryItem({ key: nume, id: null, name: nume, image: null, hasChildren: false });
    } else {
      setCatLocal(nume);
    }
  }

  const eticheta = categorie === "toate" ? "Toate categoriile" : categorie;

  return (
    <form {...propsForm}
      className={`relative flex items-stretch rounded-[var(--st-radius)] border border-[var(--st-border)] bg-[var(--st-surface)] focus-within:border-[var(--st-primary)] transition-colors ${compact ? "h-11" : "h-12"}`}>
      <input
        type="search"
        value={valoare}
        onChange={(e) => scrie(e.target.value)}
        placeholder="Cauta produse..."
        aria-label="Cauta produse"
        className="flex-1 min-w-0 px-4 bg-transparent text-sm text-[var(--st-text)] placeholder:text-[var(--st-muted)] focus:outline-none rounded-l-[inherit]"
      />

      {categorii.length > 0 && (
        <div className="relative hidden sm:block border-l border-[var(--st-border)]"
          onBlur={() => { inchide.current = window.setTimeout(() => setDeschis(false), 120); }}
          onFocus={() => { if (inchide.current) window.clearTimeout(inchide.current); }}>
          <button type="button" onClick={() => setDeschis((v) => !v)}
            aria-expanded={deschis}
            className="h-full px-3.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors whitespace-nowrap">
            <span className="max-w-[10rem] truncate">{eticheta}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${deschis ? "rotate-180" : ""}`} />
          </button>
          {deschis && (
            /* Lista ramane una obisnuita, nu `listbox`: fara `role="option"` si
               fara navigare cu sagetile, rolul ar promite un tipar pe care nu-l
               implementeaza si cititorul de ecran ar anunta o lista goala. */
            <ul aria-label="Categorii"
              className="absolute right-0 top-full mt-1 z-50 min-w-[14rem] max-h-72 overflow-y-auto rounded-[var(--st-radius)] border border-[var(--st-border)] bg-[var(--st-surface)] shadow-lg py-1">
              {["toate", ...categorii].map((c, i) => (
                <li key={`${i}-${c}`}>
                  <button type="button" onClick={() => alegeCategorie(c)}
                    className="w-full text-left px-3.5 py-2 text-sm text-[var(--st-text)] hover:bg-[var(--st-primary-soft)] transition-colors"
                    style={c === categorie ? { color: "var(--st-primary)", fontWeight: 600 } : undefined}>
                    {c === "toate" ? "Toate categoriile" : c}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button type="submit" aria-label="Cauta"
        className="px-4 flex items-center justify-center border-l border-[var(--st-border)] text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors rounded-r-[inherit]">
        <Search className="h-4 w-4" />
      </button>

      {/* Rezultatele apar sub bara, nu dupa o navigare. Se inchid la Escape si
          la parasirea barei, ca orice panou care acopera pagina. */}
      {rezultate}
    </form>
  );
}

/** Cosul, cu numarul de produse si totalul — ca in referinta. */
function Cos({
  mode,
  count,
  total,
}: {
  mode: CartMode;
  count: number;
  total: number;
}) {
  if (mode === "hidden") return null;

  const continut = (
    <>
      <span className="relative">
        <ShoppingBag className="h-5 w-5 text-[var(--st-text)]" />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </span>
      <span className="hidden sm:inline text-sm font-semibold text-[var(--st-text)] tabular-nums">
        {formatPrice(total)}
      </span>
    </>
  );

  const cls = "flex items-center gap-3 pl-1 pr-1 sm:pr-2 h-10 hover:opacity-80 transition-opacity";
  return (
    <CartControl className={cls}>
      {continut}
    </CartControl>
  );
}
