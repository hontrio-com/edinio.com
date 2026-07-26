"use client";

import { useRef, useState } from "react";
import { ChevronDown, Search, ShoppingBag } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { formatPrice, whatsappLink } from "@/lib/utils/format";
import { StoreNavHamburger, StoreNavLinks } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStoreChrome, useStorefrontOptional } from "@/components/storefront/StorefrontProvider";

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
export function HeaderSearch() {
  const {
    business,
    basePath,
    menu,
    pageContent,
    features,
    hasAnnouncementBar,
    cartMode,
    openCart,
    currentPageSlug,
    searchCategories,
  } = useStoreChrome();
  const { count, total } = useCart();
  const catalog = useStorefrontOptional();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.logo_size ?? 36;
  const showCall = features.floating_call === true && !!business.phone;
  const showWhatsApp = features.floating_whatsapp !== false && !!business.whatsapp;
  const acasa = catalog ? "#" : `${basePath}/`;

  const categorii = catalog
    ? catalog.currentCategoryItems.map((c) => c.name)
    : (searchCategories ?? []);

  return (
    <header className={`sticky ${hasAnnouncementBar ? "top-9" : "top-0"} z-30 bg-[var(--st-surface)]/95 backdrop-blur-md border-b border-[var(--st-border)]`}>
      <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
        {/* Randul principal */}
        <div className="h-16 flex items-center gap-3 lg:gap-6">
          <div className="lg:hidden">
            <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} />
          </div>

          <a href={acasa} className="flex items-center min-w-0 shrink-0 hover:opacity-80 transition-opacity mx-auto lg:mx-0" aria-label={nume}>
            {business.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cdnImage(business.logo_url, 480)} alt={nume}
                style={{ height: logoSize, maxWidth: logoSize * 5 }}
                className="w-auto object-contain" />
            ) : (
              <span className="text-lg font-black tracking-tight text-[var(--st-text)] truncate">{nume}</span>
            )}
          </a>

          {/* Cautarea, pe randul principal doar de la lg in sus. */}
          <div className="hidden lg:block flex-1 min-w-0">
            <SearchBar basePath={basePath} categorii={categorii} />
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
            {showCall && (
              <a href={`tel:${business.phone}`} aria-label="Suna"
                className="hidden sm:flex w-10 h-10 rounded-full items-center justify-center transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--st-primary-soft)", color: "var(--st-primary)" }}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </a>
            )}
            {showWhatsApp && (
              <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
                className="hidden sm:flex w-10 h-10 rounded-full items-center justify-center transition-opacity hover:opacity-80"
                style={{ backgroundColor: "rgba(37, 211, 102, 0.12)", color: "#25D366" }}>
                <svg viewBox="0 0 448 512" className="h-4 w-4" fill="currentColor">
                  <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                </svg>
              </a>
            )}

            <Cos mode={cartMode} count={count} total={total} basePath={basePath} onOpen={openCart} />
          </div>
        </div>

        {/* Meniul, sub randul principal pe desktop. */}
        {menu.length > 0 && (
          <div className="hidden lg:flex items-center h-11 border-t border-[var(--st-border)]">
            <StoreNavLinks items={menu} basePath={basePath} color="var(--st-primary)" currentSlug={currentPageSlug} />
          </div>
        )}
      </div>

      {/* Pe mobil cautarea are randul ei: intr-o bara de 16 unitati n-ar mai incapea nimic. */}
      <div className="lg:hidden px-4 pb-3">
        <SearchBar basePath={basePath} categorii={categorii} compact />
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
  basePath,
  categorii,
  compact = false,
}: {
  basePath: string;
  categorii: string[];
  compact?: boolean;
}) {
  const catalog = useStorefrontOptional();
  const [local, setLocal] = useState("");
  const [catLocal, setCatLocal] = useState("toate");
  const [deschis, setDeschis] = useState(false);
  const inchide = useRef<number | null>(null);

  const valoare = catalog ? catalog.search : local;
  const categorie = catalog ? catalog.categoryFilter : catLocal;

  function scrie(v: string) {
    if (catalog) {
      if (catalog.search === "" && v !== "") catalog.setSortTouched(false);
      catalog.setSearch(v);
    } else {
      setLocal(v);
    }
  }

  function alegeCategorie(nume: string) {
    setDeschis(false);
    if (catalog) {
      if (nume === "toate") catalog.resetCategory();
      else catalog.selectCategoryItem({ key: nume, id: null, name: nume, image: null, hasChildren: false });
    } else {
      setCatLocal(nume);
    }
  }

  function trimite(e: React.FormEvent) {
    e.preventDefault();
    // Pe pagina de magazin filtrarea s-a intamplat deja la fiecare tasta.
    if (catalog) return;
    const p = new URLSearchParams();
    if (valoare.trim()) p.set("q", valoare.trim());
    if (categorie !== "toate") p.set("cat", categorie);
    window.location.href = `${basePath}/${p.toString() ? `?${p}` : ""}`;
  }

  const eticheta = categorie === "toate" ? "Toate categoriile" : categorie;

  return (
    <form role="search" onSubmit={trimite}
      className={`flex items-stretch rounded-[var(--st-radius)] border border-[var(--st-border)] bg-[var(--st-surface)] overflow-hidden focus-within:border-[var(--st-primary)] transition-colors ${compact ? "h-11" : "h-12"}`}>
      <input
        type="search"
        value={valoare}
        onChange={(e) => scrie(e.target.value)}
        placeholder="Cauta produse..."
        aria-label="Cauta produse"
        className="flex-1 min-w-0 px-4 bg-transparent text-sm text-[var(--st-text)] placeholder:text-[var(--st-muted)] focus:outline-none"
      />

      {categorii.length > 0 && (
        <div className="relative hidden sm:block border-l border-[var(--st-border)]"
          onBlur={() => { inchide.current = window.setTimeout(() => setDeschis(false), 120); }}
          onFocus={() => { if (inchide.current) window.clearTimeout(inchide.current); }}>
          <button type="button" onClick={() => setDeschis((v) => !v)}
            aria-expanded={deschis} aria-haspopup="listbox"
            className="h-full px-3.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors whitespace-nowrap">
            <span className="max-w-[10rem] truncate">{eticheta}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${deschis ? "rotate-180" : ""}`} />
          </button>
          {deschis && (
            <ul role="listbox"
              className="absolute right-0 top-full mt-1 z-50 min-w-[14rem] max-h-72 overflow-y-auto rounded-[var(--st-radius)] border border-[var(--st-border)] bg-[var(--st-surface)] shadow-lg py-1">
              {["toate", ...categorii].map((c) => (
                <li key={c}>
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
        className="px-4 flex items-center justify-center border-l border-[var(--st-border)] text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors">
        <Search className="h-4 w-4" />
      </button>
    </form>
  );
}

/** Cosul, cu numarul de produse si totalul — ca in referinta. */
function Cos({
  mode,
  count,
  total,
  basePath,
  onOpen,
}: {
  mode: "drawer" | "link" | "hidden";
  count: number;
  total: number;
  basePath: string;
  onOpen: () => void;
}) {
  if (mode === "hidden") return null;

  const continut = (
    <>
      <span className="relative">
        <ShoppingBag className="h-5 w-5 text-[var(--st-text)]" />
        <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
          {count > 9 ? "9+" : count}
        </span>
      </span>
      <span className="hidden sm:inline text-sm font-semibold text-[var(--st-text)] tabular-nums">
        {formatPrice(total)}
      </span>
    </>
  );

  const cls = "flex items-center gap-3 pl-1 pr-1 sm:pr-2 h-10 hover:opacity-80 transition-opacity";
  return mode === "drawer" ? (
    <button type="button" onClick={onOpen} aria-label="Deschide cosul de cumparaturi" className={cls}>
      {continut}
    </button>
  ) : (
    <a href={`${basePath}/`} aria-label="Mergi la magazin" className={cls}>
      {continut}
    </a>
  );
}
