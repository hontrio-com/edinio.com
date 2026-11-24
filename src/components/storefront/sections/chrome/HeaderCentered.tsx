"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Mail, Phone, Search, ShoppingBag, X } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { esteActiv, menuItemHref } from "@/lib/pages/menu";
import { StoreNavHamburger } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStoreChrome, type CartMode } from "@/components/storefront/StorefrontProvider";
import { useHeaderSettings } from "@/components/storefront/sections/_shared/header-settings";
import { CartControl } from "@/components/storefront/sections/_shared/CartControl";
import { HEADER_VARIANT_ACTIONS } from "@/lib/storefront/design/registry";
import { useCautareHeader } from "@/components/storefront/sections/_shared/cautare";
import { radacinaMagazin } from "@/lib/storefront/category-href";
import { stilRandAntet, stilSiglaAntet } from "@/lib/storefront/logo-box";
import { ActiuneCont } from "@/components/storefront/cont/ActiuneCont";

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

  // Fara „telefon": aici numarul se arata prin „Arata contactul langa logo", nu
  // ca iconita. Lista trebuie sa ramana cea din `HEADER_VARIANT_ACTIONS.centered`,
  // altfel editorul si randarea se despart din nou.
  const { actiuni, are, meniuCls, meniuStyle } = useHeaderSettings(settings, HEADER_VARIANT_ACTIONS.centered);
  const cuContact = settings.showContact !== false;
  const [cauta, setCauta] = useState(false);

  return (
    <header className={`sticky ${hasAnnouncementBar ? "top-9" : "top-0"} z-30 bg-[var(--st-surface)] border-b border-[var(--st-border)]`}>
      <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
        {/* Trei coloane de latimi egale, ca logo-ul sa cada fix pe mijlocul
            paginii, nu pe mijlocul spatiului ramas dupa contact. */}
        {/*
          ⚠ PE TELEFON, COLOANELE DIN MARGINI AU UN MINIM (20.11.2026). Cu `1fr` simplu si `min-w-0` pe grupul din
          stanga, o sigla lata (un cuvant scris pe un rand, 7:1) isi lua tot randul: coloanele din margini se strangeau
          la zero, iar sigla statea PESTE butonul de meniu si peste lupa. Masurat la 390 px: sigla 32..336, meniul
          10..54, lupa 46..90. Nu iesea nimic din ecran, deci proba de depasire din 19.11 n-a vazut-o. Sigla se
          micsoreaza in locul ramas (`.st-sigla`: `min(…, 100%)`). De la `lg` in sus, ca inainte.

          ⚠ `4rem`, NU MAI MULT. Grupul din stanga (meniul si lupa) ajunge la 74 px de la inceputul coloanei; minimul de
          64 px plus golul de 16 al grilei ii lasa 6 px pana la sigla. Prima forma avea `5rem` (coloana cat grupul), iar
          proba pe magazinele reale a aratat ce costa: sigla de 200 px a unui magazin care NU avea nicio suprapunere
          scadea la 166. Cu `4rem`, cine avea loc ramane cum era; se schimba doar siglele care stateau peste butoane.
          Egal in ambele parti, ca sigla sa ramana pe mijloc (in dreapta, contul si cosul cer 60 px).

          ⚠ `st-rand-sigla` (24.11.2026): de la `lg` in sus randul se inalta cu sigla cand ea trece de 56 px
          (`stilRandAntet`). Pe telefon ramane la 64. Vezi `logo-box.ts`.
        */}
        <div style={stilRandAntet(logoSize)}
          className="h-16 lg:h-24 st-rand-sigla grid grid-cols-[minmax(4rem,1fr)_auto_minmax(4rem,1fr)] lg:grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <div className="lg:hidden flex items-center gap-1">
              <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} tema="vitrina" panaLa="lg" stil="simplu" />
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
                style={stilSiglaAntet(logoSize)}
                className="w-auto object-contain st-sigla" />
            ) : (
              <span className="text-xl lg:text-3xl font-black tracking-tight text-[var(--st-text)] truncate">{nume}</span>
            )}
          </a>

          <div className="flex items-center justify-end gap-4 lg:gap-5 text-[var(--st-text)]">
            {/* Contul meu: aprins numai din Setari, pe domeniul propriu (ActiuneCont). */}
            <ActiuneCont clasa="flex items-center gap-2.5 hover:opacity-60 transition-opacity" marime={22} stroke={STROKE} clasaText="text-[13px] font-semibold" />
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
          <nav aria-label="Meniu principal" className="mx-auto px-4 h-12 flex items-center justify-center gap-8" style={{ maxWidth: "var(--st-container)" }}>
            {menu.map((it) => {
              const activ = esteActiv(it, { currentPageSlug, isHome });
              return (
                // Pagina curenta nu se marcheaza doar prin culoare: subliniere
                // pentru cine nu o distinge, `aria-current` pentru cititoare.
                <a key={it.id} href={menuItemHref(it, basePath, categoriiRoot)} aria-current={activ ? "page" : undefined}
                  // Etapa 25.16: linkul ocupa toata inaltimea barii (48 px), nu doar randul de text (20 px).
                  className={`self-stretch inline-flex items-center text-[13px] font-semibold text-[var(--st-text)] hover:opacity-60 transition-opacity whitespace-nowrap ${meniuCls}`}
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
  const camp = useRef<HTMLInputElement>(null);
  const { valoare, scrie, propsForm, propsZona, rezultate } = useCautareHeader({ laAplicare: onInchide });

  useEffect(() => {
    camp.current?.focus();
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onInchide(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onInchide]);

  return (
    <div className="border-t border-[var(--st-border)] bg-[var(--st-surface)]">
      <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
        <form {...propsForm} {...propsZona} className="relative h-14 flex items-center gap-3 text-[var(--st-text)]">
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
          {/* Produsele gasite, chiar sub bara. Vezi `useCautareHeader`. */}
          {rezultate}
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
