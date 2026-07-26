"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, Phone, Search, ShoppingCart, X } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { menuItemHref } from "@/lib/pages/menu";
import { StoreNavHamburger } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStoreChrome, useStorefrontOptional } from "@/components/storefront/StorefrontProvider";
import { Marquee, marqueeDuration } from "@/components/storefront/sections/_shared/Marquee";
import { SocialLinks, areSocialLinks } from "@/components/storefront/sections/_shared/SocialLinks";

const STROKE = 1.5;

/**
 * Header editorial, varianta „editorial".
 *
 * Trei benzi: o bara inchisa de contact sus, randul alb cu logo si meniu la
 * mijloc, iar banda cu anuntul DEDESUBT — nu deasupra, ca la restul
 * variantelor. De aceea varianta isi declara `hostsAnnouncement` in registry:
 * bara de anunt nu se mai randeaza separat, altfel mesajul ar aparea de doua
 * ori, o data deasupra si o data sub header.
 *
 * Cautarea nu are camp permanent: apasarea lupei inlocuieste meniul cu campul,
 * ca randul sa ramana curat — aerul e tot designul aici.
 */
export function HeaderEditorial({ settings }: { settings: Record<string, unknown> }) {
  const {
    business,
    basePath,
    menu,
    pageContent,
    features,
    social,
    cartMode,
    openCart,
    currentPageSlug,
  } = useStoreChrome();
  const { count } = useCart();
  const catalog = useStorefrontOptional();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.logo_size ?? 36;
  const showWhatsApp = features.floating_whatsapp !== false && !!business.whatsapp;
  const acasa = catalog ? "#" : `${basePath}/`;

  const baraSus = settings.showTopBar !== false && !!(business.phone || business.email || areSocialLinks(social));
  const [cauta, setCauta] = useState(false);

  return (
    <header className="sticky top-0 z-30">
      {baraSus && (
        <div style={{ backgroundColor: "var(--st-text)", color: "var(--st-surface)" }}>
          <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
            <div className="h-10 flex items-center gap-5 text-xs">
              {business.phone && (
                <a href={`tel:${business.phone}`} className="inline-flex items-center gap-2 hover:opacity-70 transition-opacity whitespace-nowrap">
                  <Phone className="h-3.5 w-3.5" strokeWidth={STROKE} />
                  {business.phone}
                </a>
              )}
              {business.email && (
                <a href={`mailto:${business.email}`} className="hidden sm:inline-flex items-center gap-2 hover:opacity-70 transition-opacity truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={STROKE} />
                  {business.email}
                </a>
              )}
              <div className="flex items-center gap-1 ml-auto">
                <SocialLinks social={social} className="w-7 h-7 flex items-center justify-center hover:opacity-70 transition-opacity" iconClass="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[var(--st-surface)]">
        <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
          <div className="h-16 flex items-center gap-4">
            <div className="lg:hidden shrink-0">
              <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} panaLa="lg" stil="simplu" />
            </div>

            <a href={acasa} className="flex items-center min-w-0 shrink-0 hover:opacity-80 transition-opacity mx-auto lg:mx-0" aria-label={nume}>
              {business.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cdnImage(business.logo_url, 480)} alt={nume}
                  style={{ height: logoSize, maxWidth: logoSize * 5 }}
                  className="w-auto object-contain" />
              ) : (
                <span className="text-2xl font-black tracking-tight text-[var(--st-text)] truncate">{nume}</span>
              )}
            </a>

            {cauta ? (
              <CampCautare basePath={basePath} onInchide={() => setCauta(false)} />
            ) : (
              <nav className="hidden lg:flex items-center gap-9 mx-auto min-w-0">
                {menu.map((it) => {
                  const activ = it.type === "page" && it.target === currentPageSlug;
                  return (
                    <a key={it.id} href={menuItemHref(it, basePath)}
                      className="text-[15px] font-semibold text-[var(--st-text)] hover:opacity-60 transition-opacity whitespace-nowrap"
                      style={activ ? { color: "var(--st-primary)" } : undefined}>
                      {it.label}
                    </a>
                  );
                })}
              </nav>
            )}

            <div className="flex items-center gap-4 shrink-0 ml-auto text-[var(--st-text)]">
              {!cauta && (
                <button type="button" onClick={() => setCauta(true)} aria-label="Cauta produse"
                  className="flex items-center justify-center hover:opacity-60 transition-opacity">
                  <Search className="h-[22px] w-[22px]" strokeWidth={STROKE} />
                </button>
              )}
              {showWhatsApp && (
                <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer" aria-label="Scrie pe WhatsApp"
                  className="hidden sm:flex items-center justify-center hover:opacity-60 transition-opacity">
                  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </a>
              )}
              <Cos mode={cartMode} count={count} basePath={basePath} onOpen={openCart} />
            </div>
          </div>
        </div>
      </div>

      <BandaAnunt />
    </header>
  );
}

/**
 * Banda cu anuntul, sub header.
 *
 * Foloseste acelasi text si aceeasi viteza ca bara de anunt obisnuita, dar
 * discret: fundalul paginii, textul magazinului si un romb intre repetari, in
 * loc de banda plina de culoare.
 */
function BandaAnunt() {
  const { pageContent } = useStoreChrome();
  const bar = pageContent.announcement_bar;
  if (pageContent.show_announcement_on_store === false || bar?.enabled !== true) return null;

  return (
    <div className="h-10 overflow-hidden flex items-center bg-[var(--st-bg)] border-y border-[var(--st-border)]">
      <Marquee durata={marqueeDuration(bar.speed)}
        className="inline-flex items-center gap-10 px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--st-text)]">
        {bar.text}
        <span aria-hidden style={{ color: "var(--st-primary)" }}>&#10022;</span>
      </Marquee>
    </div>
  );
}

/**
 * Campul de cautare care ia locul meniului.
 *
 * Pe magazin filtreaza pe loc, la fiecare tasta; de pe alte pagini duce la
 * magazin cu termenul in adresa.
 */
function CampCautare({ basePath, onInchide }: { basePath: string; onInchide: () => void }) {
  const catalog = useStorefrontOptional();
  const [local, setLocal] = useState("");
  const camp = useRef<HTMLInputElement>(null);
  const valoare = catalog ? catalog.search : local;

  useEffect(() => {
    camp.current?.focus();
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onInchide(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onInchide]);

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
    if (catalog) {
      onInchide();
      return;
    }
    const q = valoare.trim();
    window.location.href = `${basePath}/${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  }

  return (
    <form role="search" onSubmit={trimite} className="flex-1 min-w-0 mx-auto flex items-center gap-3 border-b border-[var(--st-text)]">
      <Search className="h-[18px] w-[18px] shrink-0 text-[var(--st-muted)]" strokeWidth={STROKE} />
      <input
        ref={camp}
        type="search"
        value={valoare}
        onChange={(e) => scrie(e.target.value)}
        placeholder="Ce cauti astazi?"
        aria-label="Cauta produse"
        className="flex-1 min-w-0 h-9 bg-transparent text-sm text-[var(--st-text)] placeholder:text-[var(--st-muted)] focus:outline-none"
      />
      <button type="button" onClick={onInchide} aria-label="Inchide cautarea"
        className="shrink-0 text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors">
        <X className="h-[18px] w-[18px]" strokeWidth={STROKE} />
      </button>
    </form>
  );
}

/** Cosul, cu insigna rotunda in culoarea de accent. */
function Cos({
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
      <ShoppingCart className="h-[22px] w-[22px]" strokeWidth={STROKE} />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ backgroundColor: "var(--st-accent)", color: "var(--st-accent-contrast)" }}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </>
  );

  const cls = "relative flex items-center justify-center hover:opacity-60 transition-opacity";
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
