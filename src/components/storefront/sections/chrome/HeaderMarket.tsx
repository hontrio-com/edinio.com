"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, Menu, Phone, Search, ShoppingBag, Undo2 } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { formatPrice, whatsappLink } from "@/lib/utils/format";
import { menuItemHref } from "@/lib/pages/menu";
import { StoreNavHamburger } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStoreChrome, useStorefrontOptional } from "@/components/storefront/StorefrontProvider";

const STROKE = 1.6;

/**
 * Header de tip magazin mare, varianta „market".
 *
 * Trei randuri, ca la marile magazine online: o bara subtire de servicii sus,
 * randul principal cu logo, cautare lata si cos, apoi o bara cu toate
 * categoriile, meniul si telefonul. Geometrie dreapta si un buton de cautare
 * plin, scris — nu o iconita — pentru ca aici cautarea e felul principal in care
 * se navigheaza un catalog mare.
 *
 * Mobil: bara de servicii centrata, logo cu iconite, iar cautarea coboara pe
 * randul ei langa hamburger.
 */
export function HeaderMarket({ settings }: { settings: Record<string, unknown> }) {
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
  const showWhatsApp = features.floating_whatsapp !== false && !!business.whatsapp;
  const acasa = catalog ? "#" : `${basePath}/`;

  const categorii = catalog
    ? catalog.currentCategoryItems.map((c) => ({ name: c.name, image: c.image }))
    : (searchCategories ?? []).map((name) => ({ name, image: null }));

  const baraSus = settings.showTopBar !== false;
  const textSus = typeof settings.topText === "string" ? settings.topText.trim() : "";
  const telefonJos = settings.showHotline !== false && !!business.phone;

  return (
    <header className={`sticky ${hasAnnouncementBar ? "top-9" : "top-0"} z-30 bg-[var(--st-surface)]/95 backdrop-blur-md border-b border-[var(--st-border)]`}>
      {baraSus && (
        <div className="border-b border-[var(--st-border)] bg-[var(--st-bg)]">
          <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
            <div className="h-9 flex items-center justify-center lg:justify-between gap-4 text-xs text-[var(--st-muted)]">
              {textSus && <span className="hidden lg:block truncate">{textSus}</span>}
              <div className="flex items-center gap-3 lg:gap-4 ml-auto lg:ml-0">
                {business.email && (
                  <a href={`mailto:${business.email}`} className="hover:text-[var(--st-text)] transition-colors truncate max-w-[14rem]">
                    {business.email}
                  </a>
                )}
                {business.email && <span aria-hidden className="text-[var(--st-border)]">|</span>}
                <a href={`${basePath}/retur`} className="inline-flex items-center gap-1.5 hover:text-[var(--st-text)] transition-colors whitespace-nowrap">
                  <Undo2 className="h-3.5 w-3.5" strokeWidth={STROKE} />
                  Retur produs
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
        <div className="h-16 lg:h-[84px] flex items-center gap-4 lg:gap-8">
          <a href={acasa} className="flex items-center min-w-0 shrink-0 hover:opacity-80 transition-opacity" aria-label={nume}>
            {business.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cdnImage(business.logo_url, 480)} alt={nume}
                style={{ height: logoSize, maxWidth: logoSize * 5 }}
                className="w-auto object-contain" />
            ) : (
              <span className="text-2xl font-black tracking-tight text-[var(--st-text)] truncate">{nume}</span>
            )}
          </a>

          <div className="hidden lg:block flex-1 min-w-0">
            <BaraCautare basePath={basePath} categorii={categorii.map((c) => c.name)} />
          </div>

          <div className="flex items-center gap-4 sm:gap-5 shrink-0 ml-auto lg:ml-0">
            {showWhatsApp && (
              <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer" aria-label="Scrie pe WhatsApp"
                className="hidden sm:block text-[var(--st-text)] hover:opacity-70 transition-opacity">
                <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </a>
            )}
            <Cos mode={cartMode} count={count} total={total} basePath={basePath} onOpen={openCart} />
          </div>
        </div>
      </div>

      {/* Randul de jos: categoriile, meniul si telefonul. */}
      <div className="hidden lg:block border-t border-[var(--st-border)]">
        <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
          <div className="h-12 flex items-center gap-7">
            {categorii.length > 0 && <ToateCategoriile categorii={categorii} basePath={basePath} />}

            {menu.map((it) => {
              const activ = it.type === "page" && it.target === currentPageSlug;
              return (
                <a key={it.id} href={menuItemHref(it, basePath)}
                  className="text-sm font-medium text-[var(--st-text)] hover:opacity-70 transition-opacity whitespace-nowrap"
                  style={activ ? { color: "var(--st-primary)" } : undefined}>
                  {it.label}
                </a>
              );
            })}

            {telefonJos && (
              <a href={`tel:${business.phone}`} className="ml-auto inline-flex items-center gap-2 text-sm text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors">
                <Phone className="h-4 w-4" strokeWidth={STROKE} />
                Telefon: <strong className="font-bold text-[var(--st-text)]">{business.phone}</strong>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Pe mobil cautarea sta langa hamburger: in randul cu logo n-ar incapea. */}
      <div className="lg:hidden px-4 pb-3 flex items-center gap-3">
        <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} panaLa="lg" />
        <div className="flex-1 min-w-0">
          <BaraCautare basePath={basePath} categorii={categorii.map((c) => c.name)} compact />
        </div>
      </div>
    </header>
  );
}

/**
 * Bara de cautare: selectorul de categorie la stanga, campul la mijloc, butonul
 * plin la dreapta.
 *
 * Pe magazin filtreaza pe loc, la fiecare tasta; de pe alte pagini duce la
 * magazin cu termenul si categoria in adresa.
 */
function BaraCautare({
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
    if (!catalog) {
      setLocal(v);
      return;
    }
    if (catalog.search === "" && v !== "") catalog.setSortTouched(false);
    catalog.setSearch(v);
  }

  function alegeCategorie(nume: string) {
    setDeschis(false);
    if (!catalog) {
      setCatLocal(nume);
      return;
    }
    if (nume === "toate") catalog.resetCategory();
    else catalog.selectCategoryItem({ key: nume, id: null, name: nume, image: null, hasChildren: false });
  }

  function trimite(e: React.FormEvent) {
    e.preventDefault();
    if (catalog) return;
    const p = new URLSearchParams();
    if (valoare.trim()) p.set("q", valoare.trim());
    if (categorie !== "toate") p.set("cat", categorie);
    window.location.href = `${basePath}/${p.toString() ? `?${p}` : ""}`;
  }

  return (
    <form role="search" onSubmit={trimite}
      className={`flex items-stretch rounded-[var(--st-radius-sm)] border-2 bg-[var(--st-surface)] overflow-hidden ${compact ? "h-11" : "h-12"}`}
      style={{ borderColor: "var(--st-primary)" }}>
      {categorii.length > 0 && (
        <div className="relative hidden sm:block shrink-0"
          onBlur={() => { inchide.current = window.setTimeout(() => setDeschis(false), 120); }}
          onFocus={() => { if (inchide.current) window.clearTimeout(inchide.current); }}>
          <button type="button" onClick={() => setDeschis((v) => !v)} aria-expanded={deschis} aria-haspopup="listbox"
            className="h-full pl-4 pr-3 flex items-center gap-1.5 text-sm text-[var(--st-text)] hover:opacity-70 transition-opacity whitespace-nowrap border-r border-[var(--st-border)]">
            <span className="max-w-[9rem] truncate">{categorie === "toate" ? "Toate" : categorie}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${deschis ? "rotate-180" : ""}`} strokeWidth={STROKE} />
          </button>
          {deschis && (
            <ul role="listbox"
              className="absolute left-0 top-full mt-1 z-50 min-w-[14rem] max-h-72 overflow-y-auto rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] shadow-lg py-1">
              {["toate", ...categorii].map((c) => (
                <li key={c}>
                  <button type="button" onClick={() => alegeCategorie(c)}
                    className="w-full text-left px-4 py-2 text-sm text-[var(--st-text)] hover:bg-[var(--st-primary-soft)] transition-colors"
                    style={c === categorie ? { color: "var(--st-primary)", fontWeight: 600 } : undefined}>
                    {c === "toate" ? "Toate categoriile" : c}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <input
        type="search"
        value={valoare}
        onChange={(e) => scrie(e.target.value)}
        placeholder="Ce cauti astazi?"
        aria-label="Cauta produse"
        className="flex-1 min-w-0 px-4 bg-transparent text-sm text-[var(--st-text)] placeholder:text-[var(--st-muted)] focus:outline-none"
      />

      <button type="submit" aria-label="Cauta"
        className={`shrink-0 flex items-center justify-center font-bold text-sm transition-opacity hover:opacity-85 ${compact ? "w-12" : "px-7"}`}
        style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
        {compact ? <Search className="h-5 w-5" strokeWidth={2} /> : "Cauta"}
      </button>
    </form>
  );
}

/** Panoul cu toate categoriile, deschis din randul de jos. */
function ToateCategoriile({
  categorii,
  basePath,
}: {
  categorii: { name: string; image: string | null }[];
  basePath: string;
}) {
  const [deschis, setDeschis] = useState(false);
  const zona = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!deschis) return;
    const onDoc = (e: MouseEvent) => {
      if (!zona.current?.contains(e.target as Node)) setDeschis(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [deschis]);

  return (
    <div ref={zona} className="relative shrink-0">
      <button type="button" onClick={() => setDeschis((v) => !v)} aria-expanded={deschis}
        className="inline-flex items-center gap-2 text-sm font-bold text-[var(--st-text)] hover:opacity-70 transition-opacity">
        <Menu className="h-[18px] w-[18px]" strokeWidth={2} />
        Toate categoriile
        <ChevronDown className={`h-4 w-4 transition-transform ${deschis ? "rotate-180" : ""}`} strokeWidth={STROKE} />
      </button>

      {deschis && (
        <ul className="absolute left-0 top-full mt-2 z-50 w-72 max-h-[70vh] overflow-y-auto rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] shadow-xl py-1.5">
          {categorii.map((c) => (
            <li key={c.name}>
              <a href={`${basePath}/?cat=${encodeURIComponent(c.name)}`}
                className="flex items-center gap-3 px-3.5 py-2 hover:bg-[var(--st-primary-soft)] transition-colors">
                {c.image ? (
                  <span className="relative w-7 h-7 rounded-[var(--st-radius-sm)] overflow-hidden shrink-0 bg-[var(--st-bg)]">
                    <Image src={c.image} alt="" fill sizes="28px" className="object-cover" />
                  </span>
                ) : (
                  <span className="w-7 h-7 rounded-[var(--st-radius-sm)] shrink-0 flex items-center justify-center text-[11px] font-bold"
                    style={{ backgroundColor: "var(--st-primary-soft)", color: "var(--st-primary)" }}>
                    {c.name[0]?.toUpperCase()}
                  </span>
                )}
                <span className="text-sm text-[var(--st-text)] truncate">{c.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Cosul: iconita cu insigna in coltul de jos si, pe desktop, totalul alaturi.
 *
 * Insigna sta jos-dreapta, nu sus, ca in modelul dupa care e facut header-ul.
 */
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
      <span className="relative shrink-0">
        <ShoppingBag className="h-[26px] w-[26px] text-[var(--st-text)]" strokeWidth={STROKE} />
        <span className="absolute -bottom-1 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--st-surface)]"
          style={{ backgroundColor: "var(--st-accent)", color: "var(--st-accent-contrast)" }}>
          {count > 9 ? "9+" : count}
        </span>
      </span>
      <span className="hidden lg:flex flex-col leading-tight">
        <span className="text-xs text-[var(--st-muted)]">Cosul meu</span>
        <span className="text-sm font-bold text-[var(--st-text)] tabular-nums">{formatPrice(total)}</span>
      </span>
    </>
  );

  const cls = "flex items-center gap-2.5 hover:opacity-80 transition-opacity";
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
