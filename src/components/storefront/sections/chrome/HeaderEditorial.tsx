"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Mail, Phone, Search, ShoppingCart, X } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { esteActiv, menuItemHref } from "@/lib/pages/menu";
import { StoreNavHamburger } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStoreChrome, type CartMode } from "@/components/storefront/StorefrontProvider";
import { useHeaderSettings } from "@/components/storefront/sections/_shared/header-settings";
import { Marquee, marqueeDuration } from "@/components/storefront/sections/_shared/Marquee";
import { SocialLinks, areSocialLinks } from "@/components/storefront/sections/_shared/SocialLinks";
import { CartControl } from "@/components/storefront/sections/_shared/CartControl";
import { HEADER_VARIANT_ACTIONS } from "@/lib/storefront/design/registry";
import { useCautareHeader } from "@/components/storefront/sections/_shared/cautare";
import { radacinaMagazin } from "@/lib/storefront/category-href";
import { stilSigla } from "@/lib/storefront/logo-box";

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
    categoriiRoot,
    menu,
    pageContent,
    social,
    cartMode,
    currentPageSlug,
    isHome,
  } = useStoreChrome();
  const { count } = useCart();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.logo_size ?? 36;
  /*
   * Logo-ul duce ACASA, mereu.
   *
   * Statea pe `#` cand erai deja pe prima pagina — o ancora goala, care doar sare
   * in capul paginii. Dar prima pagina filtrata („?cat=", „?q=", pagina 3) e tot
   * prima pagina, deci logo-ul nu facea nimic tocmai cand vizitatorul voia sa
   * scape de filtre si sa o ia de la capat. Iar `${basePath}/` cu slash final
   * costa un 308 la fiecare apasare pe adresa cu slug; `radacinaMagazin` il scoate.
   */
  const acasa = radacinaMagazin(basePath);

  const { actiuni, meniuCls, meniuStyle } = useHeaderSettings(settings, HEADER_VARIANT_ACTIONS.editorial);

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
              <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} tema="vitrina" panaLa="lg" stil="simplu" />
            </div>

            {/* Fara logo, ancora trebuie sa se poata stramta: intr-un `shrink-0`
                `truncate` n-are de unde taia si un nume lung latfeste randul. */}
            {business.logo_url ? (
              <a href={acasa}
                className={cauta
                  ? "hidden lg:flex items-center min-w-0 hover:opacity-80 transition-opacity"
                  : "flex items-center min-w-0 hover:opacity-80 transition-opacity"}
                aria-label={nume}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cdnImage(business.logo_url, 480)} alt={nume}
                  style={stilSigla(logoSize)}
                  className="w-auto object-contain" />
              </a>
            ) : (
              <a href={acasa} className="flex items-center min-w-0 hover:opacity-80 transition-opacity" aria-label={nume}>
                <span className="text-2xl font-black tracking-tight text-[var(--st-text)] truncate">{nume}</span>
              </a>
            )}

            {cauta ? (
              <CampCautare onInchide={() => setCauta(false)} />
            ) : (
              <nav className="hidden lg:flex items-center gap-9 mx-auto min-w-0">
                {menu.map((it) => {
                  const activ = esteActiv(it, { currentPageSlug, isHome });
                  return (
                    <a key={it.id} href={menuItemHref(it, basePath, categoriiRoot)}
                      className={`text-[15px] font-semibold text-[var(--st-text)] hover:opacity-60 transition-opacity whitespace-nowrap ${meniuCls}`}
                      style={{ ...meniuStyle, ...(activ ? { color: "var(--st-primary)" } : {}) }}>
                      {it.label}
                    </a>
                  );
                })}
              </nav>
            )}

            <div className="flex items-center gap-4 shrink-0 ml-auto text-[var(--st-text)]">
              {actiuni.map((a) => (
                <Fragment key={a}>
                  {/* Vizibil la orice latime: spre deosebire de „centrat" si
                      „pana colorata", varianta asta n-are un al doilea buton de
                      cautare langa hamburger, deci ascuns pe telefon ar insemna
                      un magazin fara nicio cale de a cauta. */}
                  {a === "cautare" && !cauta && (
                    <button type="button" onClick={() => setCauta(true)} aria-label="Cauta produse" aria-expanded={cauta}
                      className="flex items-center justify-center -m-2 p-2 hover:opacity-60 transition-opacity">
                      <Search className="h-[22px] w-[22px]" strokeWidth={STROKE} />
                    </button>
                  )}
                  {a === "whatsapp" && (
                    <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer" aria-label="Scrie pe WhatsApp"
                      className="hidden sm:flex items-center justify-center -m-2 p-2 hover:opacity-60 transition-opacity">
                      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </a>
                  )}
                  {a === "cos" && <Cos mode={cartMode} count={count} />}
                </Fragment>
              ))}
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
  const { pageContent, announcementOn, isHome } = useStoreChrome();
  const bar = pageContent.announcement_bar;
  // `announcementOn` e sectiunea din editorul de design: stinsa sau stearsa,
  // banda dinauntrul header-ului trebuie sa dispara si ea. Fara asta, singurul
  // efect al comutatorului era asupra barei separate, pe care varianta asta
  // n-o randeaza oricum.
  if (announcementOn === false) return null;
  if (isHome && pageContent.show_announcement_on_store === false) return null;
  if (bar?.enabled !== true) return null;

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
function CampCautare({ onInchide }: { onInchide: () => void }) {
  const camp = useRef<HTMLInputElement>(null);
  const { valoare, scrie, propsForm, propsZona, rezultate } = useCautareHeader({ laAplicare: onInchide });

  useEffect(() => {
    camp.current?.focus();
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onInchide(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onInchide]);

  return (
    <form {...propsForm} {...propsZona} className="relative flex-1 min-w-0 mx-auto flex items-center gap-3 border-b border-[var(--st-text)]">
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
      {/* Produsele gasite, chiar sub bara. Vezi `useCautareHeader`. */}
      {rezultate}
    </form>
  );
}

/** Cosul, cu insigna rotunda in culoarea de accent. */
function Cos({
  mode,
  count,
}: {
  mode: CartMode;
  count: number;
}) {
  if (mode === "hidden") return null;

  const continut = (
    // Insigna se agata de iconita, nu de buton: cu suprafata de atins pe buton,
    // ancorarea la el ar duce-o cu 8px in afara iconitei.
    <span className="relative flex items-center justify-center">
      <ShoppingCart className="h-[22px] w-[22px]" strokeWidth={STROKE} />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ backgroundColor: "var(--st-accent)", color: "var(--st-accent-contrast)" }}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </span>
  );

  // Iconita ramane de 22px, dar suprafata de atins ajunge la 38px: marginea
  // negativa anuleaza padding-ul, deci randul arata neschimbat.
  const cls = "flex items-center justify-center -m-2 p-2 hover:opacity-60 transition-opacity";
  return (
    <CartControl className={cls}>
      {continut}
    </CartControl>
  );
}
