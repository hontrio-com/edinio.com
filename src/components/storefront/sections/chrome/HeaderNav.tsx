"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, Search, ShoppingCart, X } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { buildProductSearchIndex, queryProductSearchIndex } from "@/lib/storefront/product-search";
import { formatPrice, whatsappLink } from "@/lib/utils/format";
import { menuItemHref, type MenuItem } from "@/lib/pages/menu";
import { StoreNavHamburger } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStoreChrome, useStorefrontOptional, type CartMode } from "@/components/storefront/StorefrontProvider";
import { useHeaderSettings } from "@/components/storefront/sections/_shared/header-settings";
import { CartControl } from "@/components/storefront/sections/_shared/CartControl";
import { HEADER_VARIANT_ACTIONS } from "@/lib/storefront/design/registry";
import { hrefCatalog, hrefCategorie } from "@/lib/storefront/category-href";

/** Iconitele acestei variante au contur subtire, nu gros. */
const STROKE = 1.6;

/**
 * Header cu meniu inline si cos evidentiat, varianta „nav".
 *
 * Desktop: logo la stanga, imediat langa el meniul pe orizontala, iar la dreapta
 * cautarea ca iconita cu text, butoanele de contact si cosul ca pastila inchisa
 * cu totalul in ea. Mobil: hamburger, logo centrat, cos.
 *
 * Cautarea nu ocupa spatiu permanent: deschide un panou peste pagina. Pe
 * magazin, panoul arata sugestii din catalogul deja incarcat si filtreaza la
 * confirmare; de pe alte pagini duce la magazin cu termenul in adresa.
 */
export function HeaderNav({ settings }: { settings: Record<string, unknown> }) {
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
  const [cautareDeschisa, setCautareDeschisa] = useState(false);

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.logo_size ?? 36;
  const acasa = isHome ? "#" : `${basePath}/`;

  const { actiuni, meniuCls, meniuStyle } = useHeaderSettings(settings, HEADER_VARIANT_ACTIONS.nav);

  // Categoriile de nivel intai, nu cele ale categoriei in care a intrat
  // vizitatorul: panoul „Produse" din header nu are cale de intoarcere, deci o
  // lista care se schimba la fiecare drill l-ar lasa blocat in subarbore. Pe
  // paginile fara catalog `searchCategories` sunt oricum radacinile.
  const categorii = catalog
    ? catalog.rootCategoryItems.map((c) => ({ key: c.key, name: c.name, image: c.image }))
    : (searchCategories ?? []).map((name, i) => ({ key: `cat-${i}`, name, image: null }));

  const iconBtn =
    "w-10 h-10 rounded-full flex items-center justify-center text-[var(--st-text)] hover:bg-[var(--st-primary-soft)] transition-colors";

  return (
    <>
      <header className={`sticky ${hasAnnouncementBar ? "top-9" : "top-0"} z-30 bg-[var(--st-surface)]/95 backdrop-blur-md`}>
        <div className="mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
          <div className="h-16 lg:h-[72px] flex items-center gap-3">
            <div className="lg:hidden">
              <StoreNavHamburger items={menu} basePath={basePath} color="var(--st-primary)" logoUrl={business.logo_url} storeName={nume} currentSlug={currentPageSlug} panaLa="lg" />
            </div>

            {/* Fara logo, ancora trebuie sa se poata stramta: intr-un `shrink-0`
                `truncate` n-are de unde taia si un nume lung latfeste randul. */}
            {business.logo_url ? (
              <a href={acasa} className="flex items-center min-w-0 hover:opacity-80 transition-opacity lg:mr-6" aria-label={nume}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cdnImage(business.logo_url, 480)} alt={nume}
                  style={{ height: logoSize, maxWidth: logoSize * 5 }}
                  className="w-auto max-w-full object-contain" />
              </a>
            ) : (
              <a href={acasa} className="flex items-center min-w-0 hover:opacity-80 transition-opacity lg:mr-6" aria-label={nume}>
                <span className="text-xl font-black tracking-tight text-[var(--st-text)] truncate">{nume}</span>
              </a>
            )}

            <MeniuInline
              menu={menu}
              basePath={basePath}
              currentPageSlug={currentPageSlug}
              categorii={categorii}
              meniuCls={meniuCls}
              meniuStyle={meniuStyle}
            />

            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {actiuni.map((a) => (
                <Fragment key={a}>
                  {a === "cautare" && (
                    <>
                      <button type="button" onClick={() => setCautareDeschisa(true)}
                        className="hidden sm:inline-flex items-center gap-2 h-10 px-2.5 rounded-full text-[var(--st-text)] hover:bg-[var(--st-primary-soft)] transition-colors"
                        aria-label="Cauta produse" aria-expanded={cautareDeschisa}>
                        <Search className="h-[18px] w-[18px]" strokeWidth={STROKE} />
                        <span className="text-sm font-medium">Cauta</span>
                      </button>
                      <button type="button" onClick={() => setCautareDeschisa(true)} className={`sm:hidden ${iconBtn}`}
                        aria-label="Cauta produse" aria-expanded={cautareDeschisa}>
                        <Search className="h-[18px] w-[18px]" strokeWidth={STROKE} />
                      </button>
                    </>
                  )}
                  {a === "telefon" && (
                    <a href={`tel:${business.phone}`} aria-label="Suna" className={`hidden sm:flex ${iconBtn}`}>
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </a>
                  )}
                  {a === "whatsapp" && (
                    <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={`hidden sm:flex ${iconBtn}`}>
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </a>
                  )}

                  {a === "cos" && <PastilaCos mode={cartMode} count={count} total={total} />}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </header>

      {cautareDeschisa && (
        <PanouCautare basePath={basePath} onClose={() => setCautareDeschisa(false)} />
      )}
    </>
  );
}

/**
 * Meniul pe orizontala, langa logo.
 *
 * Primul element e „Produse", cu un panou de categorii — echivalentul dropdown-ului
 * de magazin din referinta. Categoriile magazinului sunt oricum ierarhice si cu
 * imagini, deci meritau un loc mai bun decat o pastila in catalog.
 */
function MeniuInline({
  menu,
  basePath,
  currentPageSlug,
  categorii,
  meniuCls,
  meniuStyle,
}: {
  menu: MenuItem[];
  basePath: string;
  currentPageSlug?: string | null;
  categorii: { key: string; name: string; image: string | null }[];
  meniuCls: string;
  meniuStyle: { fontFamily: string };
}) {
  const { catalogRoot } = useStoreChrome();
  const [deschis, setDeschis] = useState(false);
  const zona = useRef<HTMLDivElement>(null);

  // Click in afara inchide panoul; altfel ar ramane agatat dupa navigare.
  useEffect(() => {
    if (!deschis) return;
    const onDoc = (e: MouseEvent) => {
      if (!zona.current?.contains(e.target as Node)) setDeschis(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [deschis]);

  const link =
    `text-[15px] font-medium text-[var(--st-text)] hover:opacity-60 transition-opacity whitespace-nowrap ${meniuCls}`;

  return (
    <nav className="hidden lg:flex items-center gap-7 min-w-0" aria-label="Navigare principala" style={meniuStyle}>
      {categorii.length > 0 && (
        <div ref={zona} className="relative">
          <button type="button" onClick={() => setDeschis((v) => !v)} aria-expanded={deschis}
            className={`${link} inline-flex items-center gap-1`}>
            Produse
            <ChevronDown className={`h-4 w-4 transition-transform ${deschis ? "rotate-180" : ""}`} strokeWidth={STROKE} />
          </button>
          {deschis && (
            <div className="absolute left-0 top-full mt-3 z-50 w-[min(38rem,80vw)] rounded-[var(--st-radius-lg)] border border-[var(--st-border)] bg-[var(--st-surface)] shadow-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--st-muted)] mb-3">
                Pe categorii
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {categorii.slice(0, 12).map((c) => (
                  <a key={c.key} href={hrefCategorie(catalogRoot, c.name)}
                    className="flex items-center gap-2.5 p-2 rounded-[var(--st-radius)] hover:bg-[var(--st-primary-soft)] transition-colors">
                    {c.image ? (
                      <span className="relative w-9 h-11 rounded-md overflow-hidden shrink-0 bg-[var(--st-bg)]">
                        <Image src={c.image} alt="" fill sizes="36px" className="object-cover" />
                      </span>
                    ) : (
                      <span className="w-9 h-11 rounded-md shrink-0 flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: "var(--st-primary-soft)", color: "var(--st-primary)" }}>
                        {c.name[0]?.toUpperCase()}
                      </span>
                    )}
                    <span className="text-sm text-[var(--st-text)] truncate">{c.name}</span>
                  </a>
                ))}
              </div>
              <a href={catalogRoot}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: "var(--st-primary)" }}>
                Toate produsele
                <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
          )}
        </div>
      )}

      {menu.map((it) => {
        const activ = it.type === "page" && it.target === currentPageSlug;
        return (
          <a key={it.id} href={menuItemHref(it, basePath, catalogRoot)} className={link}
            aria-current={activ ? "page" : undefined}
            style={activ ? { color: "var(--st-primary)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "6px" } : undefined}>
            {it.label}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * Panoul de cautare, peste pagina.
 *
 * Pe magazin arata sugestii din catalogul deja incarcat, folosind acelasi index
 * ca bara de cautare a catalogului. Fara catalog (pagina de produs, pagini
 * custom) e doar un camp care trimite la magazin.
 */
function PanouCautare({ basePath, onClose }: { basePath: string; onClose: () => void }) {
  const { catalogRoot } = useStoreChrome();
  const catalog = useStorefrontOptional();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const panou = useRef<HTMLDivElement>(null);
  // Panoul traieste doar cat e deschis, iar parintele ii da un `onClose` nou la
  // fiecare randare; tinut intr-un ref, efectul de mai jos ramane pe montare.
  const inchide = useRef(onClose);
  useEffect(() => { inchide.current = onClose; }, [onClose]);

  // Panoul se declara `aria-modal`, deci trebuie sa si fie: pagina de dedesubt
  // nu se deruleaza, Tab ramane inauntru, iar la inchidere focusul se intoarce
  // pe butonul care l-a deschis.
  useEffect(() => {
    const inainte = document.activeElement as HTMLElement | null;
    input.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        inchide.current();
        return;
      }
      if (e.key !== "Tab" || !panou.current) return;
      const focusabile = panou.current.querySelectorAll<HTMLElement>("a[href], button, input");
      if (focusabile.length === 0) return;
      const primul = focusabile[0];
      const ultimul = focusabile[focusabile.length - 1];
      if (e.shiftKey && document.activeElement === primul) {
        e.preventDefault();
        ultimul.focus();
      } else if (!e.shiftKey && document.activeElement === ultimul) {
        e.preventDefault();
        primul.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      inainte?.focus();
    };
  }, []);

  // Sugestiile trec prin acelasi motor ca bara de cautare a catalogului: altfel
  // „rosu" nu gaseste nimic aici, dar da rezultate la confirmare.
  const produse = catalog?.visibleProducts;
  const index = useMemo(
    () => buildProductSearchIndex((produse ?? []).map((p) => ({ id: p.id, name: p.name, category: p.category }))),
    [produse],
  );
  const sugestii = useMemo(() => {
    if (!produse || text.trim().length < 2) return [];
    const scoruri = queryProductSearchIndex(index, text);
    if (!scoruri) return [];
    return produse
      .filter((p) => scoruri.has(p.id))
      .sort((a, b) => (scoruri.get(b.id) ?? 0) - (scoruri.get(a.id) ?? 0))
      .slice(0, 6);
  }, [produse, index, text]);

  function confirma(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (catalog) {
      catalog.setSortTouched(false);
      catalog.setSearch(q);
      onClose();
      document.getElementById("produse")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.location.href = hrefCatalog(catalogRoot, q ? `q=${encodeURIComponent(q)}` : "");
  }

  return (
    <div ref={panou} className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Cauta produse">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--st-surface)] shadow-xl">
        <div className="mx-auto px-4 py-5" style={{ maxWidth: "var(--st-container)" }}>
          <div className="flex items-center gap-3">
            <form onSubmit={confirma} className="flex-1 flex items-center gap-3 border-b-2 border-[var(--st-text)] pb-2">
              <Search className="h-5 w-5 text-[var(--st-muted)] shrink-0" strokeWidth={STROKE} />
              <input ref={input} type="search" value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Cauta produse..."
                aria-label="Cauta produse"
                className="flex-1 min-w-0 bg-transparent text-lg text-[var(--st-text)] placeholder:text-[var(--st-muted)] focus:outline-none" />
            </form>
            <button type="button" onClick={onClose} aria-label="Inchide cautarea"
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors">
              <X className="h-5 w-5" strokeWidth={STROKE} />
            </button>
          </div>

          {sugestii.length > 0 && (
            <ul className="mt-4 space-y-1">
              {sugestii.map((p) => {
                const img = Array.isArray(p.images) && p.images[0] ? String(p.images[0]) : null;
                return (
                  <li key={p.id}>
                    {/* `slug` e nullable: produsele importate fara el ar da o
                        adresa care se termina in „null". Ruta citeste dupa id
                        cand argumentul e un UUID, deci refugiul duce la produs. */}
                    <a href={`${basePath}/product/${p.slug ?? p.id}`}
                      className="flex items-center gap-3 p-2 rounded-[var(--st-radius)] hover:bg-[var(--st-primary-soft)] transition-colors">
                      <span className="relative w-11 h-11 rounded-md overflow-hidden shrink-0 bg-[var(--st-bg)]">
                        {img && <Image src={img} alt="" fill sizes="44px" className="object-contain p-1" />}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-[var(--st-text)] truncate">{p.name}</span>
                      <span className="text-sm font-semibold shrink-0" style={{ color: "var(--st-primary)" }}>
                        {formatPrice(Number(p.price))}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Cosul ca pastila inchisa cu totalul in ea — elementul care da caracterul
 * acestei variante. Numarul de produse sta ca insigna pe colt, in culoarea de
 * accent, ca sa se vada peste fundalul inchis.
 */
function PastilaCos({
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
      <ShoppingCart className="h-[18px] w-[18px]" strokeWidth={STROKE} />
      {/* Pe telefon randul are deja hamburger, logo si lupa: totalul l-ar impinge peste latime. */}
      <span className="hidden sm:inline text-sm font-bold tabular-nums">{formatPrice(total)}</span>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--st-surface)]"
          style={{ backgroundColor: "var(--st-accent)", color: "var(--st-accent-contrast)" }}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </>
  );

  const cls = "relative inline-flex items-center gap-2 h-10 pl-3.5 pr-4 rounded-full transition-opacity hover:opacity-85 ml-1";
  const stil = { backgroundColor: "var(--st-text)", color: "var(--st-surface)" };

  return (
    <CartControl className={cls} style={stil}>
      {continut}
    </CartControl>
  );
}
