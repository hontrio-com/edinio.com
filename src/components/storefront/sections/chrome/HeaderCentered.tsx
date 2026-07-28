"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Mail, Phone, Search, ShoppingBag, X } from "lucide-react";
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

const STROKE = 1.5;

/**
 * Header simetric cu logo centrat, varianta „centered".
 *
 * Randul de sus e impartit in trei: contactul la stanga, logo-ul exact la
 * mijloc, iconitele la dreapta. Meniul are randul lui dedesubt, tot centrat.
 * Simetria e tot designul aici, deci logo-ul ramane la mijloc indiferent cat de
 * lung e contactul — coloanele laterale au aceeasi latime.
 *
 * Mobil: hamburger si lupa la stanga, logo la mijloc, cos la dreapta.
 */
export function HeaderCentered({ settings }: { settings: Record<string, unknown> }) {
  const {
    business,
    basePath,
    catalogRoot,
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

  // Fara „telefon": aici numarul se arata prin „Arata contactul langa logo", nu
  // ca iconita. Lista trebuie sa ramana cea din `HEADER_VARIANT_ACTIONS.centered`,
  // altfel editorul si randarea se despart din nou.
  const { actiuni, are, meniuCls, meniuStyle } = useHeaderSettings(settings, HEADER_VARIANT_ACTIONS.centered);
  const cuContact = settings.showContact !== false;
  const [cauta, setCauta] = useState(false);

  return (
    <header className={`sticky ${hasAnnouncementBar ? "top-9" : "top-0"} z-30 bg-[var(--st-surface)]/95 backdrop-blur-md border-b border-[var(--st-border)]`}>
      <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
        {/* Trei coloane de latimi egale, ca logo-ul sa cada fix pe mijlocul
            paginii, nu pe mijlocul spatiului ramas dupa contact. */}
        <div className="h-16 lg:h-24 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <div className="lg:hidden flex items-center gap-1">
              <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} panaLa="lg" stil="simplu" />
              {are("cautare") && (
                <button type="button" onClick={() => setCauta(true)} aria-label="Cauta produse"
                  className="w-11 h-11 -m-1.5 flex items-center justify-center text-[var(--st-text)] hover:opacity-60 transition-opacity">
                  <Search className="h-[19px] w-[19px]" strokeWidth={STROKE} />
                </button>
              )}
            </div>

            {cuContact && business.phone && (
              <Contact icon={<Phone className="h-[18px] w-[18px]" strokeWidth={STROKE} />}
                eticheta="Suna-ne" valoare={business.phone} href={`tel:${business.phone}`} />
            )}
            {cuContact && business.email && (
              <Contact icon={<Mail className="h-[18px] w-[18px]" strokeWidth={STROKE} />}
                eticheta="Scrie-ne" valoare={business.email} href={`mailto:${business.email}`} ascunsSubXl />
            )}
          </div>

          <a href={acasa} className="flex items-center justify-center min-w-0 hover:opacity-80 transition-opacity" aria-label={nume}>
            {business.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cdnImage(business.logo_url, 480)} alt={nume}
                style={{ height: logoSize, maxWidth: logoSize * 5 }}
                className="w-auto max-w-full object-contain" />
            ) : (
              <span className="text-xl lg:text-3xl font-black tracking-tight text-[var(--st-text)] truncate">{nume}</span>
            )}
          </a>

          <div className="flex items-center justify-end gap-4 lg:gap-5 text-[var(--st-text)]">
            {actiuni.map((a) => (
              <Fragment key={a}>
                {a === "cautare" && (
                  <button type="button" onClick={() => setCauta(true)} aria-label="Cauta produse"
                    className="hidden lg:flex items-center justify-center hover:opacity-60 transition-opacity">
                    <Search className="h-[22px] w-[22px]" strokeWidth={STROKE} />
                  </button>
                )}
                {a === "whatsapp" && (
                  <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer" aria-label="Scrie pe WhatsApp"
                    className="hidden lg:flex items-center justify-center hover:opacity-60 transition-opacity">
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

      {menu.length > 0 && (
        <div className="hidden lg:block border-t border-[var(--st-border)]">
          <nav className="mx-auto px-4 h-12 flex items-center justify-center gap-8" style={{ maxWidth: "var(--st-container)" }}>
            {menu.map((it) => {
              const activ = it.type === "page" && it.target === currentPageSlug;
              return (
                // Pagina curenta nu se marcheaza doar prin culoare: subliniere
                // pentru cine nu o distinge, `aria-current` pentru cititoare.
                <a key={it.id} href={menuItemHref(it, basePath, catalogRoot)} aria-current={activ ? "page" : undefined}
                  className={`text-[13px] font-semibold text-[var(--st-text)] hover:opacity-60 transition-opacity whitespace-nowrap ${meniuCls}`}
                  style={{ ...meniuStyle, ...(activ ? { color: "var(--st-primary)", textDecoration: "underline", textUnderlineOffset: "6px" } : {}) }}>
                  {it.label}
                </a>
              );
            })}
          </nav>
        </div>
      )}

      {cauta && <PanouCautare onInchide={() => setCauta(false)} />}
    </header>
  );
}

/** Contact pe doua randuri: eticheta marunta deasupra, valoarea dedesubt. */
function Contact({
  icon,
  eticheta,
  valoare,
  href,
  ascunsSubXl = false,
}: {
  icon: React.ReactNode;
  eticheta: string;
  valoare: string;
  href: string;
  ascunsSubXl?: boolean;
}) {
  return (
    <a href={href} className={`${ascunsSubXl ? "hidden xl:flex" : "hidden lg:flex"} items-center gap-2.5 min-w-0 text-[var(--st-text)] hover:opacity-60 transition-opacity`}>
      <span className="shrink-0">{icon}</span>
      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-[11px] text-[var(--st-muted)]">{eticheta}</span>
        <span className="text-[13px] font-semibold truncate">{valoare}</span>
      </span>
    </a>
  );
}

/**
 * Panoul de cautare, peste randul de meniu.
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
    <div className="border-t border-[var(--st-border)] bg-[var(--st-surface)]">
      <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
        <form role="search" onSubmit={trimite} className="h-14 flex items-center gap-3 text-[var(--st-text)]">
          <Search className="h-5 w-5 shrink-0 text-[var(--st-muted)]" strokeWidth={STROKE} />
          <input
            ref={camp}
            type="search"
            value={valoare}
            onChange={(e) => scrie(e.target.value)}
            placeholder="Ce cauti astazi?"
            aria-label="Cauta produse"
            className="flex-1 min-w-0 bg-transparent text-base focus:outline-none placeholder:text-[var(--st-muted)]"
          />
          <button type="button" onClick={onInchide} aria-label="Inchide cautarea"
            className="w-8 h-8 shrink-0 flex items-center justify-center text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors">
            <X className="h-5 w-5" strokeWidth={STROKE} />
          </button>
        </form>
      </div>
    </div>
  );
}

/** Cosul: iconita cu insigna si, pe desktop, cuvantul alaturi. */
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
      <span className="relative shrink-0">
        <ShoppingBag className="h-[22px] w-[22px]" strokeWidth={STROKE} />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: "var(--st-accent)", color: "var(--st-accent-contrast)" }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </span>
      <span className="hidden lg:inline text-[13px] font-semibold">Cos</span>
    </>
  );

  const cls = "flex items-center gap-2.5 hover:opacity-60 transition-opacity";
  return (
    <CartControl className={cls}>
      {continut}
    </CartControl>
  );
}
