"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Phone, Search, ShoppingBag, X } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { menuItemHref } from "@/lib/pages/menu";
import { hrefCatalog } from "@/lib/storefront/category-href";
import { StoreNavHamburger } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useCatalogCautabil, useStoreChrome, type CartMode } from "@/components/storefront/StorefrontProvider";
import { useHeaderSettings } from "@/components/storefront/sections/_shared/header-settings";
import { CartControl } from "@/components/storefront/sections/_shared/CartControl";
import { HEADER_VARIANT_ACTIONS } from "@/lib/storefront/design/registry";

const STROKE = 1.7;

/**
 * Header inchis cu pana diagonala, varianta „wedge".
 *
 * O banda inchisa pe toata latimea, taiata in dreapta de o pana in culoarea
 * magazinului, pe care stau iconitele. Culorile nu sunt alese aici: banda
 * imprumuta paleta inchisa a footerului, deci un magazin care isi schimba
 * footerul isi schimba si header-ul, fara reglaje in plus.
 *
 * Mobil: hamburger si cautare la stanga, logo la mijloc, pana mica cu cosul.
 */
export function HeaderWedge({ settings }: { settings: Record<string, unknown> }) {
  const {
    business,
    basePath,
    categoriiRoot,
    menu,
    pageContent,
    hasAnnouncementBar,
    cartMode,
    currentPageSlug,
    isHome,
  } = useStoreChrome();
  const { count } = useCart();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.logo_size ?? 36;
  const acasa = isHome ? "#" : `${basePath}/`;

  const { actiuni, are, meniuCls, meniuStyle } = useHeaderSettings(settings, HEADER_VARIANT_ACTIONS.wedge);
  const meniuStanga = settings.menuAlign === "stanga";

  const [cautareDeschisa, setCautareDeschisa] = useState(false);

  return (
    <header className={`sticky ${hasAnnouncementBar ? "top-9" : "top-0"} z-30`}
      style={{ backgroundColor: "var(--st-footer-bg)", color: "var(--st-footer-text)" }}>
      {/* Banda taie pana in dreapta, deci are nevoie de `overflow-hidden`.
          Panoul de cautare sta in afara ei, ca sa poata cobori sub bara. */}
      <div className="relative overflow-hidden">
        <div aria-hidden
          className="absolute inset-y-0 right-0 w-24 lg:w-[calc((100vw-var(--st-container))/2+20rem)] [clip-path:polygon(56px_0,100%_0,100%_100%,0_100%)] lg:[clip-path:polygon(88px_0,100%_0,100%_100%,0_100%)]"
          style={{ backgroundColor: "var(--st-primary)" }} />

        <div className="relative mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
          <div className="h-14 lg:h-[88px] flex items-center gap-3 lg:gap-8">
            <div className="lg:hidden flex items-center gap-1 shrink-0">
              <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} panaLa="lg" stil="simplu" />
              {are("cautare") && (
                <button type="button" onClick={() => setCautareDeschisa((v) => !v)} aria-label="Cauta produse"
                  className="w-11 h-11 -m-1.5 flex items-center justify-center hover:opacity-70 transition-opacity">
                  <Search className="h-[19px] w-[19px]" strokeWidth={STROKE} />
                </button>
              )}
            </div>

            <a href={acasa} className="flex items-center min-w-0 hover:opacity-80 transition-opacity" aria-label={nume}>
              {business.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cdnImage(business.logo_url, 480)} alt={nume}
                  style={{ height: logoSize, maxWidth: logoSize * 5 }}
                  className="w-auto max-w-full object-contain" />
              ) : (
                <span className="text-xl lg:text-2xl font-black italic tracking-tight truncate">{nume}</span>
              )}
            </a>

            {/* Intrarile se scurteaza cand nu incap, in loc sa iasa din nav: textul
                meniului are culoarea benzii inchise si peste pana ar deveni
                ilizibil, iar ultimele intrari ar trece si peste iconite. */}
            <nav className={`hidden lg:flex items-center gap-8 min-w-0 ${meniuStanga ? "" : "mx-auto"}`}>
              {menu.map((it) => {
                const activ = it.type === "page" && it.target === currentPageSlug;
                return (
                  <a key={it.id} href={menuItemHref(it, basePath, categoriiRoot)}
                    className={`text-[15px] truncate transition-opacity hover:opacity-100 ${meniuCls} ${activ ? "font-bold opacity-100" : "font-medium opacity-55"}`}
                    style={meniuStyle}>
                    {it.label}
                  </a>
                );
              })}
            </nav>

            {/* Iconitele stau pe pana, deci se coloreaza dupa ea, nu dupa banda.
                Latimea rezervata la lg tine meniul dincoace de pana: pana intra
                pana la 20rem din marginea ecranului, iar meniul se opreste unde
                incepe zona iconitelor. */}
            <div className="flex items-center justify-end gap-3 lg:gap-5 shrink-0 ml-auto lg:min-w-[18rem]" style={{ color: "var(--st-primary-contrast)" }}>
              {actiuni.map((a) => (
                <Fragment key={a}>
                  {a === "cautare" && (
                    <button type="button" onClick={() => setCautareDeschisa((v) => !v)} aria-label="Cauta produse"
                      className="hidden lg:flex items-center justify-center hover:opacity-70 transition-opacity">
                      <Search className="h-[21px] w-[21px]" strokeWidth={STROKE} />
                    </button>
                  )}
                  {a === "telefon" && (
                    <a href={`tel:${business.phone}`} aria-label="Suna" className="hidden lg:flex items-center justify-center hover:opacity-70 transition-opacity">
                      <Phone className="h-[21px] w-[21px]" strokeWidth={STROKE} />
                    </a>
                  )}
                  {a === "whatsapp" && (
                    <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer" aria-label="Scrie pe WhatsApp"
                      className="hidden lg:flex items-center justify-center hover:opacity-70 transition-opacity">
                      <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
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

      {are("cautare") && cautareDeschisa && (
        <PanouCautare onInchide={() => setCautareDeschisa(false)} />
      )}
    </header>
  );
}

/**
 * Panoul de cautare, cobarat sub banda.
 *
 * Pe magazin filtreaza pe loc, la fiecare tasta; de pe alte pagini duce la
 * magazin cu termenul in adresa.
 */
function PanouCautare({ onInchide }: { onInchide: () => void }) {
  const { catalogRoot } = useStoreChrome();
  const catalog = useCatalogCautabil();
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
    window.location.href = hrefCatalog(catalogRoot, q ? `q=${encodeURIComponent(q)}` : "");
  }

  return (
    <div className="border-t" style={{ borderColor: "color-mix(in srgb, var(--st-footer-text) 15%, transparent)" }}>
      <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
        <form role="search" onSubmit={trimite} className="h-16 flex items-center gap-3">
          <Search className="h-5 w-5 shrink-0 opacity-60" strokeWidth={STROKE} />
          <input
            ref={camp}
            type="search"
            value={valoare}
            onChange={(e) => scrie(e.target.value)}
            placeholder="Ce cauti astazi?"
            aria-label="Cauta produse"
            className="flex-1 min-w-0 bg-transparent text-base focus:outline-none placeholder:opacity-50"
          />
          <button type="button" onClick={onInchide} aria-label="Inchide cautarea"
            className="w-8 h-8 flex items-center justify-center shrink-0 hover:opacity-70 transition-opacity">
            <X className="h-5 w-5" strokeWidth={STROKE} />
          </button>
        </form>
      </div>
    </div>
  );
}

/** Cosul, cu insigna in culoarea benzii inchise ca sa se vada pe pana. */
function Cos({
  mode,
  count,
}: {
  mode: CartMode;
  count: number;
}) {
  if (mode === "hidden") return null;

  const continut = (
    <>
      <ShoppingBag className="h-[21px] w-[21px]" strokeWidth={STROKE} />
      {count > 0 && (
        <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ backgroundColor: "var(--st-footer-bg)", color: "var(--st-footer-text)" }}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </>
  );

  const cls = "relative flex items-center justify-center hover:opacity-70 transition-opacity";
  return (
    <CartControl className={cls}>
      {continut}
    </CartControl>
  );
}
