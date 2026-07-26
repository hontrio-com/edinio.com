"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, LayoutGrid, Phone, Search, ShoppingCart } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { menuItemHref } from "@/lib/pages/menu";
import { resolveHref } from "@/lib/pages/href";
import { StoreNavHamburger } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStoreChrome, useStorefrontOptional } from "@/components/storefront/StorefrontProvider";
import { useHeaderSettings } from "@/components/storefront/sections/_shared/header-settings";

const STROKE = 1.7;

/**
 * Header cu pastile si cerculete, varianta „pills".
 *
 * Banda are fundalul paginii, nu al continutului, deci elementele albe de
 * deasupra ies in evidenta: pastila de categorii, campul de cautare rotunjit cu
 * buton circular colorat, butonul conturat de actiune si iconitele in cerculete.
 * Cosul sta intr-un cerc inchis, ca sa fie ultimul lucru pe care il pierde ochiul.
 *
 * Mobil: hamburger, logo centrat, cos.
 */
export function HeaderPills({ settings }: { settings: Record<string, unknown> }) {
  const {
    business,
    basePath,
    menu,
    pageContent,
    hasAnnouncementBar,
    cartMode,
    openCart,
    currentPageSlug,
    searchCategories,
  } = useStoreChrome();
  const { count } = useCart();
  const catalog = useStorefrontOptional();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.logo_size ?? 36;
  const acasa = catalog ? "#" : `${basePath}/`;

  const { actiuni, meniuCls, meniuStyle } = useHeaderSettings(settings, ["telefon", "whatsapp", "cos"]);

  const categorii = catalog
    ? catalog.currentCategoryItems.map((c) => ({ name: c.name, image: c.image }))
    : (searchCategories ?? []).map((name) => ({ name, image: null }));

  // Butonul de actiune: implicit duce la produsele cu reducere, dar comerciantul
  // poate pune orice text si orice link.
  const actiuneVizibila = settings.showAction !== false;
  const actiuneText = typeof settings.actionLabel === "string" && settings.actionLabel.trim()
    ? settings.actionLabel
    : "Reduceri";
  const actiuneLink = typeof settings.actionHref === "string" && settings.actionHref.trim()
    ? resolveHref(settings.actionHref, basePath)
    : `${basePath}/?sale=1`;

  return (
    <header className={`sticky ${hasAnnouncementBar ? "top-9" : "top-0"} z-30 bg-[var(--st-bg)]/95 backdrop-blur-md`}>
      <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
        {/* Bara de sus: paginile magazinului. Randul principal e ocupat de
            categorii, cautare si cos, deci meniul are nevoie de locul lui. */}
        {menu.length > 0 && (
          <div className="hidden lg:flex items-center justify-end gap-5 h-9 border-b border-[var(--st-border)]">
            {menu.map((it) => {
              const activ = it.type === "page" && it.target === currentPageSlug;
              return (
                <a key={it.id} href={menuItemHref(it, basePath)}
                  className={`text-[13px] text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors whitespace-nowrap ${meniuCls}`}
                  style={{ ...meniuStyle, ...(activ ? { color: "var(--st-primary)", fontWeight: 600 } : {}) }}>
                  {it.label}
                </a>
              );
            })}
          </div>
        )}

        <div className="h-16 lg:h-[76px] flex items-center gap-3">
          <div className="lg:hidden">
            <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} panaLa="lg" />
          </div>

          <a href={acasa} className="flex items-center min-w-0 shrink-0 hover:opacity-80 transition-opacity mx-auto lg:mx-0" aria-label={nume}>
            {business.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cdnImage(business.logo_url, 480)} alt={nume}
                style={{ height: logoSize, maxWidth: logoSize * 5 }}
                className="w-auto object-contain" />
            ) : (
              <span className="text-xl font-black tracking-tight text-[var(--st-text)] truncate">{nume}</span>
            )}
          </a>

          {categorii.length > 0 && <PastilaCategorii categorii={categorii} basePath={basePath} />}

          <div className="hidden lg:block flex-1 min-w-0">
            <CautareRotunjita basePath={basePath} />
          </div>

          {actiuneVizibila && (
            <a href={actiuneLink}
              className="hidden xl:inline-flex items-center h-10 px-5 rounded-full border-[1.5px] text-sm font-semibold whitespace-nowrap transition-colors hover:bg-[var(--st-primary-soft)]"
              style={{ borderColor: "var(--st-primary)", color: "var(--st-primary)" }}>
              {actiuneText}
            </a>
          )}

          <div className="flex items-center gap-1.5 shrink-0 ml-auto lg:ml-0">
            {actiuni.map((a) => (
              <Fragment key={a}>
                {a === "telefon" && (
                  <a href={`tel:${business.phone}`} aria-label="Suna" className={CERC}>
                    <Phone className="h-[18px] w-[18px]" strokeWidth={STROKE} />
                  </a>
                )}
                {a === "whatsapp" && (
                  <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={CERC}>
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </a>
                )}
                {a === "cos" && <CercCos mode={cartMode} count={count} basePath={basePath} onOpen={openCart} />}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Pe mobil cautarea coboara pe randul ei: in banda de sus n-ar incapea. */}
        <div className="lg:hidden pb-3">
          <CautareRotunjita basePath={basePath} compact />
        </div>
      </div>
    </header>
  );
}

/** Cerculetele deschise in care stau iconitele de contact. */
const CERC =
  "hidden sm:flex w-10 h-10 rounded-full items-center justify-center bg-[var(--st-surface)] text-[var(--st-text)] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:opacity-80 transition-opacity";

/** Pastila inchisa „Categorii", cu panoul de categorii dedesubt. */
function PastilaCategorii({
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
    <div ref={zona} className="relative hidden lg:block shrink-0">
      <button type="button" onClick={() => setDeschis((v) => !v)} aria-expanded={deschis}
        className="inline-flex items-center gap-2 h-11 pl-4 pr-3.5 rounded-full text-sm font-bold transition-opacity hover:opacity-85"
        style={{ backgroundColor: "var(--st-text)", color: "var(--st-surface)" }}>
        <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={STROKE} />
        Categorii
        <ChevronDown className={`h-4 w-4 transition-transform ${deschis ? "rotate-180" : ""}`} strokeWidth={STROKE} />
      </button>

      {deschis && (
        <div className="absolute left-0 top-full mt-2 z-50 w-[min(34rem,80vw)] rounded-[var(--st-radius-lg)] bg-[var(--st-surface)] shadow-xl border border-[var(--st-border)] p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {categorii.slice(0, 12).map((c) => (
              <a key={c.name} href={`${basePath}/?cat=${encodeURIComponent(c.name)}`}
                className="flex items-center gap-2.5 p-2 rounded-full hover:bg-[var(--st-primary-soft)] transition-colors">
                {c.image ? (
                  <span className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[var(--st-bg)]">
                    <Image src={c.image} alt="" fill sizes="32px" className="object-cover" />
                  </span>
                ) : (
                  <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: "var(--st-primary-soft)", color: "var(--st-primary)" }}>
                    {c.name[0]?.toUpperCase()}
                  </span>
                )}
                <span className="text-sm text-[var(--st-text)] truncate">{c.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Campul de cautare rotunjit, cu buton circular colorat la capat.
 *
 * Pe magazin filtreaza pe loc, la fiecare tasta; de pe alte pagini duce la
 * magazin cu termenul in adresa.
 */
function CautareRotunjita({ basePath, compact = false }: { basePath: string; compact?: boolean }) {
  const catalog = useStorefrontOptional();
  const [local, setLocal] = useState("");
  const valoare = catalog ? catalog.search : local;

  function scrie(v: string) {
    if (!catalog) {
      setLocal(v);
      return;
    }
    if (catalog.search === "" && v !== "") catalog.setSortTouched(false);
    catalog.setSearch(v);
  }

  function trimite(e: React.FormEvent) {
    e.preventDefault();
    if (catalog) return;
    const q = valoare.trim();
    window.location.href = `${basePath}/${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  }

  return (
    <form role="search" onSubmit={trimite}
      className={`flex items-center gap-1 rounded-full bg-[var(--st-surface)] pl-5 pr-1 ${compact ? "h-11" : "h-12"}`}>
      <input
        type="search"
        value={valoare}
        onChange={(e) => scrie(e.target.value)}
        placeholder="Cauta produse..."
        aria-label="Cauta produse"
        className="flex-1 min-w-0 bg-transparent text-sm text-[var(--st-text)] placeholder:text-[var(--st-muted)] focus:outline-none"
      />
      <button type="submit" aria-label="Cauta"
        className={`shrink-0 rounded-full flex items-center justify-center transition-opacity hover:opacity-85 ${compact ? "w-9 h-9" : "w-10 h-10"}`}
        style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
        <Search className="h-[18px] w-[18px]" strokeWidth={STROKE} />
      </button>
    </form>
  );
}

/** Cosul, in cerc inchis, cu numarul de produse ca insigna deasupra. */
function CercCos({
  mode,
  count,
  basePath,
  onOpen,
}: {
  mode: "drawer" | "link" | "hidden";
  count: number;
  basePath: string;
  onOpen: () => void;
}) {
  if (mode === "hidden") return null;

  const continut = (
    <>
      <ShoppingCart className="h-[18px] w-[18px]" strokeWidth={STROKE} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--st-bg)]"
          style={{ backgroundColor: "var(--st-accent)", color: "var(--st-accent-contrast)" }}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </>
  );

  const cls = "relative w-10 h-10 rounded-full flex items-center justify-center transition-opacity hover:opacity-85";
  const stil = { backgroundColor: "var(--st-text)", color: "var(--st-surface)" };

  return mode === "drawer" ? (
    <button type="button" onClick={onOpen} aria-label="Deschide cosul de cumparaturi" className={cls} style={stil}>
      {continut}
    </button>
  ) : (
    <a href={`${basePath}/`} aria-label="Mergi la magazin" className={cls} style={stil}>
      {continut}
    </a>
  );
}
