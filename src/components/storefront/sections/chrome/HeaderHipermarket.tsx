"use client";

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight, LayoutGrid, MapPin, Phone, Search, ShoppingCart, Undo2, X } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { pluralRo, whatsappLink } from "@/lib/utils/format";
import { esteActiv, menuItemHref } from "@/lib/pages/menu";
import { grupuriCategorii } from "@/lib/storefront/categories-chrome";
import { hrefCategorie, radacinaMagazin } from "@/lib/storefront/category-href";
import { stilSigla } from "@/lib/storefront/logo-box";
import { HEADER_VARIANT_ACTIONS } from "@/lib/storefront/design/registry";
import { StoreNavHamburger } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStoreChrome, useStorefrontOptional, type CartMode, type CategoryItem } from "@/components/storefront/StorefrontProvider";
import { useHeaderSettings } from "@/components/storefront/sections/_shared/header-settings";
import { CartControl } from "@/components/storefront/sections/_shared/CartControl";
import { useCautareHeader } from "@/components/storefront/sections/_shared/cautare";
import { ActiuneCont } from "@/components/storefront/cont/ActiuneCont";

const STROKE = 1.7;

/** Fondul campului de cautare si al cercurilor din jurul iconitelor: un gri cu o urma din culoarea principala. */
const CAMP = "color-mix(in srgb, var(--st-primary) 5%, #F2F4F7)";
/** Bara de sus: culoarea principala cu o treapta mai inchisa, ca sa nu concureze cu sigla si cu bannerul. */
const BARA_SUS = "color-mix(in srgb, var(--st-primary) 78%, #000)";
/** Cercul din jurul iconitelor (telefon, cos), care se coloreaza sub mouse. */
const CERC = "w-11 h-11 shrink-0 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--st-primary)_5%,#F2F4F7)] group-hover:bg-[var(--st-primary-soft)] transition-colors";
/** Un rand din meniul de categorii: placa rotunjita care se coloreaza usor sub mouse. */
const RAND_MENIU = "group flex items-center gap-3 px-2.5 py-2 rounded-[var(--st-radius)] hover:bg-[var(--st-primary-soft)] transition-colors";

/**
 * Antetul temei Jupiter, varianta „hipermarket” (etapa 16.2 din `docs/editor-magazin/PLAN.md`).
 *
 * Structura dupa dedeman.ro (etapa 16), aspectul propriu de la etapa 23 („sa nu fie identica 1 la 1”): o bara subtire,
 * mai inchisa decat culoarea principala, randul cu logo, cautarea-pastila, telefonul, contul si cosul, apoi bara de
 * navigare cu pastila „Toate categoriile”, care deschide meniul pe doua niveluri, si meniul magazinului.
 *
 * Cautarea ia tot ce ramane din rand (etapa 21): cu o latime fixa, langa ea ramanea un gol cat un sfert din pagina la
 * orice magazin fara cont si fara WhatsApp, iar pe pagina lata a temei nu mai avea ce sa-l umple.
 *
 * ⚠ Bara de navigare sta lipita sus la derulare, nu tot antetul: cele trei randuri au peste 170 px, iar lipite ar fi
 * mancat un sfert din ecran. Ca pe modelul lui, randul cu logo pleaca, butonul de categorii ramane la indemana.
 */
export function HeaderHipermarket({ settings }: { settings: Record<string, unknown> }) {
  const {
    business, basePath, categoriiRoot, categoriiPePagina, menu, pageContent, hasAnnouncementBar, currentPageSlug,
    searchCategories, isHome, cartMode,
  } = useStoreChrome();
  const { count } = useCart();
  const catalog = useStorefrontOptional();
  const [meniuDeschis, setMeniuDeschis] = useState(false);

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.logo_size ?? 40;
  const acasa = radacinaMagazin(basePath);
  const { actiuni, meniuCls, meniuStyle } = useHeaderSettings(settings, HEADER_VARIANT_ACTIONS.hipermarket);

  // Arborele din catalog cand pagina il are, altfel din chrome (aceeasi sursa ca „Toate categoriile” din „market”).
  const grupuri = useMemo(
    () => grupuriCategorii(catalog?.categories ?? searchCategories),
    [catalog?.categories, searchCategories],
  );

  const baraSus = settings.showTopBar !== false;
  const textSus = typeof settings.topText === "string" ? settings.topText.trim() : "";
  const telefon = settings.showHotline !== false && !!business.phone;
  const lipit = hasAnnouncementBar ? "top-9" : "top-0";

  return (
    <>
      <header className="relative z-30 bg-[var(--st-surface)]">
        {baraSus && (
          <div style={{ backgroundColor: BARA_SUS, color: "#FFFFFF" }}>
            <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
              <div className="h-8 lg:h-9 flex items-center justify-center lg:justify-between gap-4 text-[12.5px] font-medium tracking-[0.01em]">
                {textSus ? (
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--st-accent)" }} strokeWidth={2} />
                    <span className="truncate">{textSus}</span>
                  </span>
                ) : <span />}
                <div className="hidden lg:flex items-center gap-6 shrink-0 text-white/80">
                  {business.email && (
                    <a href={`mailto:${business.email}`} className="hover:text-white transition-colors truncate max-w-[16rem]">{business.email}</a>
                  )}
                  <a href={`${basePath}/retur`} className="inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap">
                    <Undo2 className="h-3.5 w-3.5" strokeWidth={2} />
                    Retur produs
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
          <div className="h-16 lg:h-[104px] flex items-center gap-3 lg:gap-9">
            <div className="lg:hidden">
              <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url}
                storeName={nume} currentSlug={currentPageSlug} tema="vitrina" panaLa="lg" />
            </div>
            <a href={acasa} className="flex items-center min-w-0 shrink-0 hover:opacity-85 transition-opacity" aria-label={nume}>
              {business.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cdnImage(business.logo_url, 480)} alt={nume} style={stilSigla(logoSize)} className="w-auto object-contain" />
              ) : (
                <span className="text-xl lg:text-[26px] font-extrabold tracking-tight truncate" style={{ color: "var(--st-primary)" }}>{nume}</span>
              )}
            </a>

            <div className="hidden lg:block flex-1 min-w-0">
              <CautareJupiter />
            </div>

            <div className="flex items-center gap-5 lg:gap-7 shrink-0 ml-auto lg:ml-0">
              {telefon && (
                <a href={`tel:${business.phone}`} className="group hidden lg:flex items-center gap-3 text-[var(--st-text)] hover:text-[var(--st-primary)] transition-colors whitespace-nowrap">
                  <span className={CERC}>
                    <Phone className="h-5 w-5" strokeWidth={STROKE} />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[12px] text-[var(--st-muted)]">Suport clienti</span>
                    <span className="block text-[15px] font-semibold">{business.phone}</span>
                  </span>
                </a>
              )}
              <ActiuneCont clasa="flex items-center gap-2 text-[var(--st-text)] hover:opacity-75 transition-opacity" marime={24} stroke={STROKE}
                clasaText="text-[15px] font-semibold" />
              {actiuni.map((a) => (
                <Fragment key={a}>
                  {a === "whatsapp" && business.whatsapp && (
                    <a href={whatsappLink(business.whatsapp)} target="_blank" rel="noopener noreferrer" aria-label="Scrie pe WhatsApp"
                      className="hidden sm:inline-flex items-center gap-2 text-[var(--st-text)] hover:opacity-75 transition-opacity">
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                      <span className="hidden xl:inline text-[15px] font-semibold">WhatsApp</span>
                    </a>
                  )}
                  {a === "cos" && <Cos mode={cartMode} count={count} />}
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Pe telefon cautarea are randul ei, ca la modelul lui. */}
        <div className="lg:hidden px-4 pb-3">
          <CautareJupiter compact />
        </div>
      </header>

      {/* Bara de navigare: lipita sus la derulare (vezi capul fisierului). */}
      <div className={`hidden lg:block sticky ${lipit} z-40 bg-[var(--st-surface)] border-y border-[var(--st-border)]`}>
        <div className="relative mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
          <div className="h-[60px] flex items-center gap-7">
            {grupuri.length > 0 && (
              <button type="button" onClick={() => setMeniuDeschis((v) => !v)} aria-expanded={meniuDeschis}
                className="shrink-0 h-11 inline-flex items-center gap-2.5 pl-4 pr-5 text-[14.5px] font-semibold rounded-full transition-[filter] hover:brightness-125"
                style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
                {meniuDeschis ? <X className="h-[18px] w-[18px]" strokeWidth={2.2} /> : <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2.2} />}
                Toate categoriile
              </button>
            )}
            {menu.length > 0 && (
              <nav aria-label="Meniul magazinului" className="flex-1 min-w-0 self-stretch flex items-stretch gap-7 overflow-x-auto [scrollbar-width:none]">
                {menu.map((it) => {
                  const activ = esteActiv(it, { currentPageSlug, isHome });
                  return (
                    <a key={it.id} href={menuItemHref(it, basePath, categoriiRoot)} aria-current={activ ? "page" : undefined}
                      className={`relative flex items-center text-[15px] font-medium text-[var(--st-text)] hover:text-[var(--st-primary)] transition-colors whitespace-nowrap after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--st-accent)] after:origin-left after:transition-transform ${activ ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"} ${meniuCls}`}
                      style={{ ...meniuStyle, ...(activ ? { color: "var(--st-primary)", fontWeight: 600 } : {}) }}>
                      {it.label}
                    </a>
                  );
                })}
              </nav>
            )}
          </div>

          {meniuDeschis && (
            <MeniuCategorii grupuri={grupuri} categoriiRoot={categoriiRoot} pePagina={categoriiPePagina === true} onInchide={() => setMeniuDeschis(false)} />
          )}
        </div>
      </div>
      {/* Fundalul intunecat de sub meniu: un clic pe el il inchide, ca pe modelul lui. */}
      {meniuDeschis && <div aria-hidden className="hidden lg:block fixed inset-0 z-30 bg-black/45" onClick={() => setMeniuDeschis(false)} />}
    </>
  );
}

/**
 * Cautarea lata (etapa 23): o pastila pe gri deschis, cu lupa in stanga si butonul „Cauta” in ea, in culoarea
 * principala; la scriere devine alba, cu chenarul in culoarea principala. Rezultatele apar chiar sub ea
 * (`useCautareHeader`), ca la celelalte antete.
 */
function CautareJupiter({ compact = false }: { compact?: boolean }) {
  const { valoare, scrie, propsForm, propsZona, rezultate } = useCautareHeader({ categorie: "toate" });
  return (
    <form {...propsForm} {...propsZona}
      className={`relative flex items-center gap-2.5 rounded-full border border-transparent bg-[var(--st-camp)] transition-colors focus-within:bg-[var(--st-surface)] focus-within:border-[var(--st-primary)] focus-within:ring-4 focus-within:ring-[var(--st-primary)]/10 ${compact ? "h-11 pl-4 pr-1" : "h-[52px] pl-5 pr-1.5"}`}
      style={{ "--st-camp": CAMP } as CSSProperties}>
      <Search aria-hidden className="h-5 w-5 shrink-0 text-[var(--st-muted)]" strokeWidth={2} />
      <input type="search" value={valoare} onChange={(e) => scrie(e.target.value)} placeholder="Ce cauti azi?" aria-label="Cauta produse"
        className="flex-1 min-w-0 bg-transparent text-[15px] text-[var(--st-text)] placeholder:text-[var(--st-muted)] focus:outline-none" />
      <button type="submit" aria-label="Cauta"
        className={`shrink-0 inline-flex items-center justify-center rounded-full font-semibold transition-[filter] hover:brightness-125 ${compact ? "h-9 w-9" : "h-10 px-6 text-[14px]"}`}
        style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
        {compact ? <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} /> : "Cauta"}
      </button>
      {rezultate}
    </form>
  );
}

/**
 * Meniul de categorii, pe doua niveluri: intai raioanele pe patru coloane, apoi, la clic pe unul cu subcategorii,
 * subcategoriile lui, cu „Inapoi” si „Vezi toata categoria”. Un raion fara subcategorii duce direct la pagina lui.
 */
function MeniuCategorii({ grupuri, categoriiRoot, pePagina, onInchide }: {
  grupuri: { radacina: CategoryItem; copii: CategoryItem[] }[];
  categoriiRoot: string;
  pePagina: boolean;
  onInchide: () => void;
}) {
  const [ales, setAles] = useState<string | null>(null);
  const grup = ales ? grupuri.find((g) => g.radacina.key === ales) ?? null : null;
  const href = (nume: string) => hrefCategorie(categoriiRoot, nume, pePagina);

  useEffect(() => {
    const laTasta = (e: KeyboardEvent) => { if (e.key === "Escape") onInchide(); };
    document.addEventListener("keydown", laTasta);
    return () => document.removeEventListener("keydown", laTasta);
  }, [onInchide]);

  return (
    <div className="absolute left-4 right-4 top-[calc(100%+8px)] z-50 bg-[var(--st-surface)] border border-[var(--st-border)] shadow-[0_24px_48px_-12px_rgba(16,24,40,0.25)] rounded-[var(--st-radius-lg)] p-4 lg:p-6 max-h-[70vh] overflow-y-auto">
      {grup ? (
        <div className="flex gap-8">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4 mb-4">
              <button type="button" onClick={() => setAles(null)} aria-label="Inapoi la toate categoriile"
                className="inline-flex items-center gap-1 text-[20px] text-[var(--st-text)] hover:text-[var(--st-primary)] transition-colors">
                <ChevronLeft className="h-5 w-5" style={{ color: "var(--st-primary)" }} strokeWidth={2.2} />
                {grup.radacina.name}
              </button>
              <a href={href(grup.radacina.name)} className="ml-auto shrink-0 px-4 py-2 text-[13px] font-semibold rounded-full border transition-colors hover:bg-[var(--st-primary-soft)]"
                style={{ borderColor: "var(--st-primary)", color: "var(--st-primary)" }}>
                Vezi toata categoria
              </a>
            </div>
            <ul className="grid grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-2.5">
              {grup.copii.map((c) => (
                <li key={c.key}>
                  <a href={href(c.name)} className="text-[15px] text-[var(--st-text)] hover:text-[var(--st-primary)] transition-colors">{c.name}</a>
                </li>
              ))}
            </ul>
          </div>
          {grup.radacina.image && (
            <a href={href(grup.radacina.name)} className="hidden xl:block relative w-56 h-44 shrink-0 rounded-[var(--st-radius)] overflow-hidden bg-[var(--st-bg)]">
              <Image src={grup.radacina.image} alt="" fill sizes="224px" className="object-cover" />
            </a>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-1">
          {grupuri.map(({ radacina, copii }) => {
            const continut = (
              <>
                {radacina.image ? (
                  <span className="relative w-10 h-10 rounded-[var(--st-radius-sm)] overflow-hidden shrink-0" style={{ backgroundColor: CAMP }}>
                    <Image src={radacina.image} alt="" fill sizes="40px" className="object-cover" />
                  </span>
                ) : <span className="w-10 h-10 shrink-0" />}
                <span className="flex-1 min-w-0 text-[15px] font-medium text-[var(--st-text)] group-hover:text-[var(--st-primary)] transition-colors truncate">{radacina.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--st-muted)] group-hover:text-[var(--st-primary)] group-hover:translate-x-0.5 transition-[color,transform]" strokeWidth={2.2} />
              </>
            );
            return (
              <li key={radacina.key}>
                {copii.length > 0 ? (
                  <button type="button" onClick={() => setAles(radacina.key)} className={`${RAND_MENIU} w-full text-left`}>{continut}</button>
                ) : (
                  <a href={href(radacina.name)} className={RAND_MENIU}>{continut}</a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Cosul: iconita cu insigna, apoi pe doua randuri eticheta si cate produse are, ca telefonul de langa el. */
function Cos({ mode, count }: { mode: CartMode; count: number }) {
  if (mode === "hidden") return null;
  return (
    <CartControl className="group flex items-center gap-3 text-[var(--st-text)] hover:text-[var(--st-primary)] transition-colors">
      <span className={`relative ${CERC}`}>
        <ShoppingCart className="h-5 w-5" strokeWidth={STROKE} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--st-surface)]"
            style={{ backgroundColor: "var(--st-accent)", color: "var(--st-accent-contrast)" }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </span>
      <span className="hidden sm:block leading-tight text-left whitespace-nowrap">
        <span className="block text-[12px] text-[var(--st-muted)]">Cosul meu</span>
        <span className="block text-[15px] font-semibold">{pluralRo(count)}</span>
      </span>
    </CartControl>
  );
}
