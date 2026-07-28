"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { StoreProductCard } from "@/components/storefront/sections/products/StoreProductCard";
import type { Fateta } from "@/lib/storefront/catalog/facets";

/**
 * Piesele comune ale paginii de catalog.
 *
 * Cele trei modele difera prin ASEZARE — filtre in bara laterala, filtre in
 * capul paginii, compact — nu prin ce scrie intr-o valoare de fateta sau cum
 * arata o pastila de filtru activ. Tinute separat, cele trei ar fi ajuns sa
 * numere altfel aceleasi produse; tinute aici, o corectie se face o data.
 *
 * Acelasi tipar ca `sections/cart/_shared/CartPieces.tsx`.
 */

/** Cate valori se vad inainte de „Arata toate": restul sunt sub o apasare. */
const VALORI_VIZIBILE = 6;

/* ─── Fatete ─────────────────────────────────────────────────────────────── */

export function GrupFatete({ fateta }: { fateta: Fateta }) {
  const { color, selectieFatete, comutaFateta } = useStorefront();
  const [toate, setToate] = useState(false);
  // Memoizat, nu scris inline: `?? []` produce un vector nou la fiecare randare,
  // deci lista de mai jos s-ar recalcula si cand nu s-a schimbat nicio bifa.
  const alese = useMemo(() => selectieFatete[fateta.cheie] ?? [], [selectieFatete, fateta.cheie]);

  // Valorile bifate raman mereu vizibile, chiar daca sunt dincolo de prag: o
  // bifa care dispare sub „Arata toate" e o bifa pe care nimeni n-o mai gaseste
  // ca s-o scoata.
  const vizibile = useMemo(() => {
    if (toate) return fateta.valori;
    const primele = fateta.valori.slice(0, VALORI_VIZIBILE);
    const ascunseBifate = fateta.valori.slice(VALORI_VIZIBILE).filter((v) => alese.includes(v.valoare));
    return [...primele, ...ascunseBifate];
  }, [toate, fateta.valori, alese]);

  return (
    <div>
      <p className="text-xs font-semibold text-[var(--st-text)] mb-2">{fateta.eticheta}</p>
      <ul className="space-y-1">
        {vizibile.map((v) => {
          const bifat = alese.includes(v.valoare);
          return (
            <li key={v.valoare}>
              {/*
                Casete de bifat adevarate, nu pastile: intr-o lista lunga de
                valori, starea „bifat" trebuie sa se vada dintr-o privire si sa
                fie citita de cititoarele de ecran fara sa depinda de culoare.
              */}
              <label className="flex items-center gap-2 py-1 cursor-pointer group">
                <span
                  className="w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors"
                  style={bifat
                    ? { backgroundColor: color, borderColor: color }
                    : { borderColor: "var(--st-border)" }}>
                  {bifat && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <input type="checkbox" className="sr-only" checked={bifat}
                  onChange={() => comutaFateta(fateta.cheie, v.valoare)} />
                <span className="text-[13px] text-[var(--st-text)] group-hover:opacity-70 transition-opacity truncate">
                  {v.valoare}
                </span>
                <span className="ml-auto text-[11px] text-[var(--st-muted)] tabular-nums shrink-0">{v.cate}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {fateta.valori.length > VALORI_VIZIBILE && (
        <button type="button" onClick={() => setToate((v) => !v)}
          className="mt-1 text-[12px] font-medium hover:opacity-70 transition-opacity"
          style={{ color: "var(--st-primary)" }}>
          {toate ? "Arata mai putine" : `Arata toate (${fateta.valori.length})`}
        </button>
      )}
    </div>
  );
}

/** Pretul si cele doua comutatoare care nu vin din date. */
export function FiltreDeBaza() {
  const { color, facets, priceMin, setPriceMin, priceMax, setPriceMax, onSaleOnly, setOnSaleOnly, inStockOnly, setInStockOnly } =
    useStorefront();
  const input =
    "w-full min-w-0 px-2.5 py-2 text-sm border border-[var(--st-border)] rounded-[var(--st-radius-sm)] bg-[var(--st-surface)] text-[var(--st-text)] focus:outline-none focus:border-[var(--st-primary)]";
  const pastila = "px-3 py-1.5 rounded-full text-[13px] border transition-colors";
  const inactiv = { backgroundColor: "transparent", color: "var(--st-text)", borderColor: "var(--st-border)" };
  const activ = { backgroundColor: color, color: "#fff", borderColor: color };

  return (
    <>
      <div>
        <p className="text-xs font-semibold text-[var(--st-text)] mb-2">Pret (lei)</p>
        <div className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min={0} aria-label="Pret minim"
            placeholder={String(facets.priceMin)} value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)} className={input} />
          <span className="text-[var(--st-muted)] shrink-0">-</span>
          <input type="number" inputMode="numeric" min={0} aria-label="Pret maxim"
            placeholder={String(facets.priceMax)} value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)} className={input} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOnSaleOnly(!onSaleOnly)} aria-pressed={onSaleOnly}
          className={pastila} style={onSaleOnly ? activ : inactiv}>
          Doar reduceri
        </button>
        <button type="button" onClick={() => setInStockOnly(!inStockOnly)} aria-pressed={inStockOnly}
          className={pastila} style={inStockOnly ? activ : inactiv}>
          Doar in stoc
        </button>
      </div>
    </>
  );
}

/**
 * Toate filtrele, in ordinea si cu grupurile alese de comerciant.
 *
 * `grupuriPornite` vine din setarile variantei (campul de tip `actions`), deci
 * ordinea si ce se vede sunt aceleasi indiferent de modelul ales.
 */
export function PanouFiltre({ grupuriPornite }: { grupuriPornite: string[] }) {
  const { fatete } = useStorefront();
  const arata = (g: string) => grupuriPornite.includes(g);

  const dupaGrup = (grup: Fateta["grup"]) => fatete.filter((f) => f.grup === grup);
  const bucati: { cheie: string; nod: React.ReactNode }[] = [];
  if (arata("pret")) bucati.push({ cheie: "pret", nod: <FiltreDeBaza /> });
  for (const g of ["atribut", "brand", "eticheta", "specificatie"] as const) {
    if (!arata(g === "atribut" ? "atribute" : g === "eticheta" ? "etichete" : g === "brand" ? "brand" : "specificatii")) continue;
    for (const f of dupaGrup(g)) bucati.push({ cheie: f.cheie, nod: <GrupFatete fateta={f} /> });
  }

  if (bucati.length === 0) return null;
  return (
    <div className="space-y-5">
      {bucati.map((b) => <div key={b.cheie}>{b.nod}</div>)}
    </div>
  );
}

/** Filtrele bifate, ca pastile care se sterg una cate una. */
export function FiltreActive() {
  const { selectieFatete, comutaFateta, activeFilterCount, resetFilters, onSaleOnly, setOnSaleOnly, inStockOnly, setInStockOnly } =
    useStorefront();
  if (activeFilterCount === 0) return null;

  const pastila =
    "inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full text-[12px] border border-[var(--st-border)] bg-[var(--st-surface)] text-[var(--st-text)] hover:opacity-70 transition-opacity";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {Object.entries(selectieFatete).flatMap(([cheie, valori]) =>
        valori.map((v) => (
          <button key={`${cheie}:${v}`} type="button" className={pastila}
            onClick={() => comutaFateta(cheie, v)} aria-label={`Scoate filtrul ${v}`}>
            {v}
            <X className="h-3 w-3" />
          </button>
        )),
      )}
      {onSaleOnly && (
        <button type="button" className={pastila} onClick={() => setOnSaleOnly(false)}>
          Doar reduceri<X className="h-3 w-3" />
        </button>
      )}
      {inStockOnly && (
        <button type="button" className={pastila} onClick={() => setInStockOnly(false)}>
          Doar in stoc<X className="h-3 w-3" />
        </button>
      )}
      <button type="button" onClick={resetFilters}
        className="text-[12px] font-medium hover:opacity-70 transition-opacity" style={{ color: "var(--st-primary)" }}>
        Sterge toate
      </button>
    </div>
  );
}

/* ─── Bara de sus ────────────────────────────────────────────────────────── */

export function Sortare() {
  // `effectiveSort`, nu `sort`: cat timp exista o cautare si nimeni n-a ales
  // altceva, sortarea e „relevanta", si asta trebuie sa arate si selectorul.
  const { setSort, setSortTouched, effectiveSort, hasSearchMatches } = useStorefront();
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-[var(--st-muted)]">
      <span className="hidden sm:inline">Sorteaza</span>
      <span className="relative inline-flex items-center">
        <select
          value={effectiveSort}
          onChange={(e) => { setSortTouched(true); setSort(e.target.value); }}
          className="appearance-none pl-3 pr-8 py-2 text-[13px] rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] text-[var(--st-text)] focus:outline-none focus:border-[var(--st-primary)]">
          {hasSearchMatches && <option value="relevance">Relevanta</option>}
          <option value="newest">Cele mai noi</option>
          <option value="price_asc">Pret crescator</option>
          <option value="price_desc">Pret descrescator</option>
          <option value="name_asc">Nume A-Z</option>
          <option value="popular">Recomandate</option>
        </select>
        <ChevronDown className="h-4 w-4 absolute right-2 pointer-events-none text-[var(--st-muted)]" />
      </span>
    </label>
  );
}

export function NumarRezultate() {
  const { filteredProducts, visibleProducts } = useStorefront();
  const n = filteredProducts.length;
  const total = visibleProducts.length;
  return (
    <p className="text-[13px] text-[var(--st-muted)]">
      {n === total ? `${n} ${n === 1 ? "produs" : "produse"}` : `${n} din ${total} produse`}
    </p>
  );
}

/** Caseta de cautare a paginii, ascunsa cand header-ul are deja una. */
export function CautareCatalog() {
  const { search, setSearch, setSortTouched, headerHasSearch } = useStorefront();
  if (headerHasSearch) return null;
  return (
    <input
      type="search"
      value={search}
      onChange={(e) => { if (!search && e.target.value) setSortTouched(false); setSearch(e.target.value); }}
      placeholder="Cauta in magazin"
      aria-label="Cauta produse"
      className="w-full px-3.5 py-2.5 text-sm rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] text-[var(--st-text)] focus:outline-none focus:border-[var(--st-primary)]"
    />
  );
}

/**
 * Butonul care deschide filtrele pe telefon, plus foaia lor.
 *
 * Pe telefon o bara laterala n-are unde sta, iar filtrele stivuite deasupra
 * grilei ar impinge produsele sub prima derulare — adica exact ce a venit
 * clientul sa vada.
 */
export function FiltrePeTelefon({ grupuriPornite }: { grupuriPornite: string[] }) {
  const { filtersOpen, setFiltersOpen, activeFilterCount, resetFilters, filteredProducts } = useStorefront();
  return (
    <>
      <button type="button" onClick={() => setFiltersOpen(true)}
        className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] text-[var(--st-text)]">
        <SlidersHorizontal className="h-4 w-4" />
        Filtre
        {activeFilterCount > 0 && (
          <span className="min-w-5 h-5 px-1 rounded-full text-[11px] font-bold text-white inline-flex items-center justify-center"
            style={{ backgroundColor: "var(--st-primary)" }}>
            {activeFilterCount}
          </span>
        )}
      </button>

      {filtersOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtre">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] flex flex-col rounded-t-2xl bg-[var(--st-surface)]">
            <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--st-border)] shrink-0">
              <span className="font-semibold text-[var(--st-text)]">Filtre</span>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Inchide filtrele"
                className="w-9 h-9 -mr-2 flex items-center justify-center text-[var(--st-muted)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <PanouFiltre grupuriPornite={grupuriPornite} />
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-[var(--st-border)] shrink-0"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
              {activeFilterCount > 0 && (
                <button type="button" onClick={resetFilters}
                  className="px-4 py-3 text-sm font-medium rounded-[var(--st-radius-sm)] border border-[var(--st-border)] text-[var(--st-text)]">
                  Sterge
                </button>
              )}
              <button type="button" onClick={() => setFiltersOpen(false)}
                className="flex-1 py-3 text-sm font-bold text-white rounded-[var(--st-radius-sm)]"
                style={{ backgroundColor: "var(--st-primary)" }}>
                Arata {filteredProducts.length} {filteredProducts.length === 1 ? "produs" : "produse"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Grila si paginarea ─────────────────────────────────────────────────── */

export function GrilaProduse({ coloane }: { coloane: number }) {
  const { paginatedProducts, filteredProducts, activeFilterCount, resetFilters, search } = useStorefront();

  if (filteredProducts.length === 0) {
    const cauta = !!search || activeFilterCount > 0;
    return (
      <div className="text-center py-20 border border-dashed border-[var(--st-border)] rounded-[var(--st-radius)]">
        <p className="font-medium text-[var(--st-text)] mb-1">
          {cauta ? "Niciun produs gasit" : "Niciun produs disponibil"}
        </p>
        <p className="text-sm text-[var(--st-muted)] mb-4">
          {cauta ? "Incearca alta cautare sau scoate cateva filtre." : "Revino curand pentru produse noi."}
        </p>
        {activeFilterCount > 0 && (
          <button type="button" onClick={resetFilters}
            className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: "var(--st-primary)" }}>
            Sterge filtrele
          </button>
        )}
      </div>
    );
  }

  const clase = coloane >= 5
    ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    : coloane === 4
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
      : "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid ${clase} gap-3 sm:gap-4`}>
      {paginatedProducts.map((p, i) => (
        <StoreProductCard key={p.id} product={p} priority={i < 4} />
      ))}
    </div>
  );
}

/**
 * Paginarea paginii de catalog.
 *
 * Numerele sunt ancore reale, ca si pe pagina principala: fara ele, paginile
 * 2..N n-ar avea niciun link crawlabil catre ele. Adresa se compune din calea
 * CURENTA, nu din radacina magazinului — altfel apasarea paginii 2 ar fi aruncat
 * vizitatorul inapoi pe pagina principala.
 */
export function Paginare() {
  const { currentPage, totalPages, goToPage, color } = useStorefront();
  if (totalPages <= 1) return null;

  const pagini = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
    .reduce<(number | "puncte")[]>((acc, p, i, arr) => {
      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("puncte");
      acc.push(p);
      return acc;
    }, []);

  const href = (p: number) => {
    if (typeof window === "undefined") return "#";
    const sp = new URLSearchParams(window.location.search);
    if (p <= 1) sp.delete("page"); else sp.set("page", String(p));
    const qs = sp.toString();
    return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  };
  const mergiLa = (p: number) => {
    goToPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nav =
    "px-3 py-2 text-sm rounded-[var(--st-radius-sm)] border border-[var(--st-border)] text-[var(--st-text)] disabled:opacity-30 hover:opacity-70 transition-opacity";

  return (
    <nav aria-label="Paginare" className="flex flex-wrap items-center justify-center gap-2 mt-8">
      <button type="button" onClick={() => mergiLa(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className={nav}>
        Inapoi
      </button>
      {pagini.map((p, i) =>
        p === "puncte" ? (
          <span key={`puncte-${i}`} className="px-1 text-[var(--st-muted)]">...</span>
        ) : (
          <a key={p} href={href(p)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              mergiLa(p);
            }}
            aria-current={currentPage === p ? "page" : undefined}
            className="inline-flex items-center justify-center min-w-[36px] h-9 text-sm rounded-[var(--st-radius-sm)] border transition-colors"
            style={currentPage === p
              ? { backgroundColor: color, borderColor: color, color: "#fff" }
              : { borderColor: "var(--st-border)", color: "var(--st-text)" }}>
            {p}
          </a>
        ),
      )}
      <button type="button" onClick={() => mergiLa(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className={nav}>
        Inainte
      </button>
    </nav>
  );
}

/* ─── Antet ──────────────────────────────────────────────────────────────── */

export function AntetPagina({ titlu, aratatTitlu = true }: { titlu: string; aratatTitlu?: boolean }) {
  const { categoryFilter } = useStorefront();
  // Categoria aleasa devine titlul: vizitatorul venit dintr-un link de categorie
  // trebuie sa vada unde a ajuns, nu un titlu generic peste o lista filtrata.
  const text = categoryFilter && categoryFilter !== "toate" ? categoryFilter : titlu;
  return (
    <h1 className={aratatTitlu ? "text-2xl font-bold text-[var(--st-text)]" : "sr-only"}>{text}</h1>
  );
}

/** Pastilele de categorie de sus, cand comerciantul le cere. */
export function CategoriiSus() {
  const { currentCategoryItems, categoryFilter, selectCategoryItem, resetCategory, isDrilled, goBackCategory, hasCategories, catalogRoot, color } =
    useStorefront();
  if (!hasCategories) return null;
  const pastila = "px-3.5 py-1.5 rounded-full text-[13px] border whitespace-nowrap transition-colors";
  const inactiv = { backgroundColor: "transparent", color: "var(--st-text)", borderColor: "var(--st-border)" };
  const activ = { backgroundColor: color, color: "#fff", borderColor: color };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button type="button" onClick={isDrilled ? goBackCategory : resetCategory}
        className={pastila} style={categoryFilter === "toate" ? activ : inactiv}>
        {isDrilled ? "Inapoi" : "Toate"}
      </button>
      {currentCategoryItems.map((c) => (
        <a key={c.key} href={`${catalogRoot}?cat=${encodeURIComponent(c.name)}`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            selectCategoryItem(c);
          }}
          className={pastila} style={categoryFilter === c.name ? activ : inactiv}>
          {c.name}
        </a>
      ))}
    </div>
  );
}
