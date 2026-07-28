"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { hrefCatalog, hrefCategorie } from "@/lib/storefront/category-href";
import { StoreProductCard } from "@/components/storefront/sections/products/StoreProductCard";
import { cdnImage } from "@/lib/cdn-image";
import { SORTARI_CATALOG } from "@/lib/storefront/design/registry";
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



/* ─── Fatete ─────────────────────────────────────────────────────────────── */

export function GrupFatete({ fateta }: { fateta: Fateta }) {
  const { color, selectieFatete, comutaFateta, setariMagazin } = useStorefront();
  const VALORI_VIZIBILE = setariMagazin.valoriVizibile;
  // Pliate implicit: comerciantul cu multe atribute vrea lista de filtre dintr-o
  // privire, nu patruzeci de valori desfasurate una sub alta.
  const [toate, setToate] = useState(false);
  const [pliat, setPliat] = useState(setariMagazin.filtrePliate);
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
  }, [toate, fateta.valori, alese, VALORI_VIZIBILE]);

  const bifate = alese.length;

  return (
    <div>
      {/*
        Titlul e buton doar cand grupurile pornesc pliate: altfel ar fi un
        control care nu face nimic vizibil si ar aparea in ordinea de tabulare
        degeaba, la fiecare fateta.
      */}
      {setariMagazin.filtrePliate ? (
        <button type="button" onClick={() => setPliat((v) => !v)} aria-expanded={!pliat}
          className="w-full flex items-center gap-1.5 text-xs font-semibold text-[var(--st-text)] mb-2 hover:opacity-70 transition-opacity">
          {fateta.eticheta}
          {bifate > 0 && <span style={{ color: "var(--st-primary)" }}>({bifate})</span>}
          <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${pliat ? "" : "rotate-180"}`} />
        </button>
      ) : (
        <p className="text-xs font-semibold text-[var(--st-text)] mb-2">{fateta.eticheta}</p>
      )}
      {pliat ? null : (
      <>
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
                {/*
                  Caseta adevarata e `sr-only`, deci inelul de focus al
                  browserului nu se vede nicaieri: fara `peer-focus-visible` pe
                  patratul desenat, navigarea cu tastatura prin patruzeci de
                  valori era complet oarba. Ordinea conteaza — `peer` trebuie sa
                  fie INAINTEA elementului care il citeste.
                */}
                <input type="checkbox" className="sr-only peer" checked={bifat}
                  onChange={() => comutaFateta(fateta.cheie, v.valoare)} />
                <span
                  className="w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-[var(--st-primary)]"
                  style={bifat
                    ? { backgroundColor: color, borderColor: color }
                    : { borderColor: "var(--st-border)" }}>
                  {bifat && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <span className="text-[13px] text-[var(--st-text)] group-hover:opacity-70 transition-opacity truncate">
                  {v.valoare}
                </span>
                {setariMagazin.arataNumaratori && (
                  <span className="ml-auto text-[11px] text-[var(--st-muted)] tabular-nums shrink-0">{v.cate}</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      {fateta.valori.length > VALORI_VIZIBILE && (
        <button type="button" onClick={() => setToate((v) => !v)}
          className="mt-1 text-[12px] font-medium hover:opacity-70 transition-opacity"
          style={{ color: "var(--st-primary)" }}>
          {toate ? "Arata mai putine" : `Inca ${fateta.valori.length - VALORI_VIZIBILE}`}
        </button>
      )}
      </>
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
 * Numele grupului de filtre din editor, pentru fiecare grup de fateta.
 *
 * Cele doua nu coincid: in editor comerciantul citeste „Atribute (marime,
 * culoare)", iar in date grupul se cheama `atribut`. Maparea sta intr-un singur
 * loc ca cele trei modele sa nu ajunga sa arate grupuri diferite.
 */
export const GRUP_DIN_FATETA: Record<Fateta["grup"], string> = {
  atribut: "atribute",
  brand: "brand",
  eticheta: "etichete",
  specificatie: "specificatii",
};

/** Categoriile ca lista de filtre, pentru modelele cu bara laterala. */
export function FiltreCategorii() {
  const { currentCategoryItems, categoryFilter, selectCategoryItem, resetCategory, isDrilled, goBackCategory, hasCategories, color } =
    useStorefront();
  if (!hasCategories) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-[var(--st-text)] mb-2">Categorii</p>
      <ul className="space-y-0.5">
        <li>
          <button type="button" onClick={isDrilled ? goBackCategory : resetCategory}
            className="w-full text-left text-[13px] py-1 hover:opacity-70 transition-opacity"
            style={categoryFilter === "toate" ? { color, fontWeight: 600 } : { color: "var(--st-text)" }}>
            {isDrilled ? "Inapoi" : "Toate produsele"}
          </button>
        </li>
        {currentCategoryItems.map((c) => (
          <li key={c.key}>
            <button type="button" onClick={() => selectCategoryItem(c)}
              className="w-full text-left text-[13px] py-1 hover:opacity-70 transition-opacity truncate"
              style={categoryFilter === c.name ? { color, fontWeight: 600 } : { color: "var(--st-text)" }}>
              {c.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
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

  const bucati: { cheie: string; nod: React.ReactNode }[] = [];
  // Ordinea e a comerciantului, nu a codului: se parcurg grupurile pornite in
  // ordinea salvata, nu fatetele in ordinea lor din date.
  for (const grup of grupuriPornite) {
    if (grup === "categorii") {
      bucati.push({ cheie: "categorii", nod: <FiltreCategorii /> });
      continue;
    }
    if (grup === "pret") {
      bucati.push({ cheie: "pret", nod: <FiltreDeBaza /> });
      continue;
    }
    for (const f of fatete.filter((x) => GRUP_DIN_FATETA[x.grup] === grup)) {
      bucati.push({ cheie: f.cheie, nod: <GrupFatete fateta={f} /> });
    }
  }

  if (bucati.length === 0) return null;
  return (
    <div className="space-y-5">
      {bucati.map((b) => <div key={b.cheie}>{b.nod}</div>)}
    </div>
  );
}

/**
 * Are magazinul ceva de aratat intr-o bara de filtre?
 *
 * Fara asta, un magazin fara atribute completate ar fi primit o coloana goala
 * langa grila. Categoriile si pretul conteaza si ele: un magazin cu categorii
 * dar fara atribute merita in continuare bara.
 */
export function useAreFiltre(grupuriPornite: string[]): boolean {
  const { fatete, hasCategories } = useStorefront();
  if (grupuriPornite.includes("categorii") && hasCategories) return true;
  if (grupuriPornite.includes("pret")) return true;
  return fatete.some((f) => grupuriPornite.includes(GRUP_DIN_FATETA[f.grup]));
}

/** Filtrele bifate, ca pastile care se sterg una cate una. */
export function FiltreActive() {
  const {
    selectieFatete, comutaFateta, activeFilterCount, resetFilters,
    onSaleOnly, setOnSaleOnly, inStockOnly, setInStockOnly,
    priceMin, setPriceMin, priceMax, setPriceMax,
  } = useStorefront();
  if (activeFilterCount === 0) return null;
  // Pretul e numarat de contor, deci trebuie sa aiba si el pastila lui: fara ea,
  // un filtru de pret activ dadea „Sterge toate" fara nimic de sters langa el,
  // iar in modelul cu filtre in capul paginii nu se vedea nicaieri ca e pornit.
  const arePret = !!priceMin.trim() || !!priceMax.trim();
  const etichetaPret = priceMin.trim() && priceMax.trim()
    ? `${priceMin.trim()} - ${priceMax.trim()} lei`
    : priceMin.trim() ? `Peste ${priceMin.trim()} lei` : `Sub ${priceMax.trim()} lei`;

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
      {arePret && (
        <button type="button" className={pastila} aria-label="Scoate filtrul de pret"
          onClick={() => { setPriceMin(""); setPriceMax(""); }}>
          {etichetaPret}<X className="h-3 w-3" />
        </button>
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
  const { setSort, setSortTouched, effectiveSort, hasSearchMatches, setariMagazin } = useStorefront();
  // O singura optiune inseamna un selector fara alegere: mai bine lipseste.
  if (setariMagazin.sortariOferite.length < 2 && !hasSearchMatches) return null;
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-[var(--st-muted)]">
      <span className="hidden sm:inline">Sorteaza</span>
      <span className="relative inline-flex items-center">
        <select
          value={effectiveSort}
          onChange={(e) => { setSortTouched(true); setSort(e.target.value); }}
          className="appearance-none pl-3 pr-8 py-2 text-[13px] rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] text-[var(--st-text)] focus:outline-none focus:border-[var(--st-primary)]">
          {hasSearchMatches && <option value="relevance">Relevanta</option>}
          {SORTARI_CATALOG
            .filter((o) => setariMagazin.sortariOferite.includes(o.value))
            .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="h-4 w-4 absolute right-2 pointer-events-none text-[var(--st-muted)]" />
      </span>
    </label>
  );
}

export function NumarRezultate() {
  const { filteredProducts, visibleProducts, setariMagazin } = useStorefront();
  if (!setariMagazin.arataNumarul) return null;
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
export function FiltrePeTelefon({ grupuriPornite, panaLa = "lg" }: { grupuriPornite: string[]; panaLa?: "lg" | "xl" }) {
  const { filtersOpen, setFiltersOpen, activeFilterCount, resetFilters, filteredProducts } = useStorefront();
  const panou = useRef<HTMLDivElement>(null);
  const declansator = useRef<HTMLButtonElement>(null);
  // Pragul vine de la model, nu e fix: la „Compact" bara laterala apare abia de
  // la 1280 px. Codat `lg`, foaia ramanea ascunsa exact acolo unde butonul care
  // o deschide era inca vizibil.
  const ascundeDeLa = panaLa === "xl" ? "xl:hidden" : "lg:hidden";

  /*
   * Escape inchide, derularea din spate se blocheaza, focusul intra in panou si
   * se intoarce pe buton la inchidere.
   *
   * Fara ele, foaia era doar un strat colorat: pe telefon pagina continua sa
   * curga sub ea, iar cine navigheaza cu tastatura ajungea in linkurile de sub
   * suprapunere, fara nicio cale de intoarcere. Sertarul de cos face deja exact
   * asta; o foaie care nu o face e o exceptie pe care nimeni n-a cerut-o.
   */
  useEffect(() => {
    if (!filtersOpen) return;
    // Nodul se retine acum, nu la curatare: pana atunci `declansator.current`
    // poate fi deja altul, sau null.
    const buton = declansator.current;
    const laTasta = (e: KeyboardEvent) => { if (e.key === "Escape") setFiltersOpen(false); };
    document.addEventListener("keydown", laTasta);
    const dinainte = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => panou.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", laTasta);
      document.body.style.overflow = dinainte;
      window.clearTimeout(t);
      buton?.focus();
    };
  }, [filtersOpen, setFiltersOpen]);

  return (
    <>
      <button ref={declansator} type="button" onClick={() => setFiltersOpen(true)}
        aria-expanded={filtersOpen}
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
        <div className={`fixed inset-0 z-40 ${ascundeDeLa}`} role="dialog" aria-modal="true" aria-label="Filtre">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFiltersOpen(false)} />
          <div ref={panou} tabIndex={-1} className="absolute inset-x-0 bottom-0 max-h-[85vh] flex flex-col rounded-t-2xl bg-[var(--st-surface)] outline-none">
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

export function GrilaProduse({ coloane, coloaneMobil = 2 }: { coloane: number; coloaneMobil?: number }) {
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

  /*
   * Clasele se aleg dintr-o harta, nu se compun din bucati.
   *
   * Tailwind citeste sursa ca text si nu vede un nume construit la executie:
   * `grid-cols-${n}` n-ar ajunge niciodata in CSS-ul final, iar grila ar cadea
   * pe o singura coloana la fiecare magazin care schimba reglajul.
   */
  const PE_MOBIL: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2" };
  const PE_ECRAN_MARE: Record<number, string> = {
    2: "sm:grid-cols-2 lg:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-3 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6",
  };
  const clase = `${PE_MOBIL[coloaneMobil] ?? "grid-cols-2"} ${PE_ECRAN_MARE[coloane] ?? PE_ECRAN_MARE[4]}`;

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
  const {
    currentPage, totalPages, goToPage, color, catalogRoot, interogareFiltre,
    setariMagazin, filteredProducts, paginatedProducts,
  } = useStorefront();
  const mod = setariMagazin.modPaginare;
  const santinela = useRef<HTMLDivElement>(null);
  const maiSunt = currentPage < totalPages;

  /*
   * Derularea infinita incarca urmatoarea pagina cand santinela intra in ecran.
   *
   * `IntersectionObserver`, nu un ascultator de derulare: acesta din urma se
   * declanseaza de sute de ori pe secunda si obliga la masuratori de asezare in
   * mijlocul derularii, adica exact felul de cod care face pagina sa se
   * balbaie pe telefon.
   */
  useEffect(() => {
    if (mod !== "infinit" || !maiSunt) return;
    const tinta = santinela.current;
    if (!tinta || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver((intrari) => {
      if (intrari.some((i) => i.isIntersecting)) goToPage(currentPage + 1);
    }, { rootMargin: "600px" });
    obs.observe(tinta);
    return () => obs.disconnect();
  }, [mod, maiSunt, currentPage, goToPage]);

  if (totalPages <= 1) return null;

  const pagini = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
    .reduce<(number | "puncte")[]>((acc, p, i, arr) => {
      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("puncte");
      acc.push(p);
      return acc;
    }, []);

  /*
   * Adresa se compune din CONTEXT, nu din `window`.
   *
   * Citit la randare, `window` nu exista pe server: fiecare numar ar fi iesit cu
   * `href="#"` in HTML-ul initial si abia la hidratare ar fi primit adresa
   * adevarata. Doua consecinte, amandoua exact pe dos fata de ce promite
   * comentariul de mai sus: o nepotrivire de hidratare la fiecare incarcare, si
   * un robot de cautare care nu vede niciun link catre paginile 2..N — pe chiar
   * pagina facuta ca sa fie catalogul crawlabil al magazinului.
   */
  const href = (p: number) => {
    const qs = p <= 1
      ? interogareFiltre
      : `${interogareFiltre}${interogareFiltre ? "&" : ""}page=${p}`;
    return hrefCatalog(catalogRoot, qs);
  };
  const mergiLa = (p: number) => {
    goToPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nav =
    "px-3 py-2 text-sm rounded-[var(--st-radius-sm)] border border-[var(--st-border)] text-[var(--st-text)] disabled:opacity-30 hover:opacity-70 transition-opacity";

  /*
   * Numerele raman in HTML si la modurile care ADUNA paginile.
   *
   * Ascunse vizual, nu scoase: linkurile sunt singurul drum prin care un robot
   * de cautare ajunge la paginile 2..N, iar la 1221 de produse sunt 61 de pagini
   * pe care altfel nu le-ar gasi nimeni. Cititoarele de ecran le primesc si ele,
   * ca alternativa la un buton pe care trebuie sa il apesi de saizeci de ori.
   */
  if (mod !== "pagini") {
    return (
      <>
        <div className="mt-8 flex flex-col items-center gap-3">
          {maiSunt && mod === "buton" && (
            <button type="button" onClick={() => goToPage(currentPage + 1)}
              className="px-6 py-3 text-sm font-semibold rounded-[var(--st-radius-sm)] border-2 transition-opacity hover:opacity-80"
              style={{ borderColor: color, color }}>
              Incarca mai multe
            </button>
          )}
          {mod === "infinit" && maiSunt && <div ref={santinela} className="h-px w-full" aria-hidden="true" />}
          <p className="text-[13px] text-[var(--st-muted)]" aria-live="polite">
            {paginatedProducts.length} din {filteredProducts.length} produse
          </p>
        </div>
        <nav aria-label="Paginare" className="sr-only">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a key={p} href={href(p)}>Pagina {p}</a>
          ))}
        </nav>
      </>
    );
  }

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
  const { categoryFilter, setariMagazin, basePath, business } = useStorefront();
  // Categoria aleasa devine titlul: vizitatorul venit dintr-un link de categorie
  // trebuie sa vada unde a ajuns, nu un titlu generic peste o lista filtrata.
  const inCategorie = !!categoryFilter && categoryFilter !== "toate";
  const text = inCategorie ? categoryFilter : titlu;

  return (
    <div className="space-y-2">
      {setariMagazin.arataFirimituri && (
        <nav aria-label="Firimituri" className="flex items-center gap-1.5 text-[13px] text-[var(--st-muted)]">
          <a href={basePath || "/"} className="hover:text-[var(--st-text)] transition-colors">
            {business.store_name ?? business.business_name}
          </a>
          <span aria-hidden="true">/</span>
          <span className={inCategorie ? "" : "text-[var(--st-text)] font-medium"}>{titlu}</span>
          {inCategorie && (
            <>
              <span aria-hidden="true">/</span>
              <span className="text-[var(--st-text)] font-medium truncate">{categoryFilter}</span>
            </>
          )}
        </nav>
      )}
      <h1 className={aratatTitlu ? "text-2xl font-bold text-[var(--st-text)]" : "sr-only"}>{text}</h1>
      {/*
        Subtitlul dispare cand vizitatorul e intr-o categorie: e scris despre
        catalogul intreg, iar peste o lista filtrata ar descrie altceva decat
        se vede.
      */}
      {setariMagazin.subtitlu && !inCategorie && (
        <p className="text-sm text-[var(--st-muted)] max-w-2xl leading-relaxed">{setariMagazin.subtitlu}</p>
      )}
    </div>
  );
}

/** Imaginea de antet, pe toata latimea, deasupra titlului. */
export function ImagineAntet() {
  const { setariMagazin } = useStorefront();
  if (!setariMagazin.imagineAntet) return null;
  return (
    <div className="relative w-full aspect-[16/5] sm:aspect-[16/4] overflow-hidden rounded-[var(--st-radius)] mb-5 bg-[var(--st-bg)]">
      {/* Decorativa: ce spune pagina e scris in titlu, chiar sub ea. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cdnImage(setariMagazin.imagineAntet, 1600)} alt="" className="w-full h-full object-cover" />
    </div>
  );
}

/** Textul de prezentare de sub grila. Locul obisnuit al textului de catalog. */
export function TextSubGrila() {
  const { setariMagazin } = useStorefront();
  if (!setariMagazin.textSubGrila) return null;
  return (
    <div className="mt-10 pt-6 border-t border-[var(--st-border)]">
      <p className="text-sm text-[var(--st-muted)] leading-relaxed whitespace-pre-line max-w-3xl">
        {setariMagazin.textSubGrila}
      </p>
    </div>
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
        <a key={c.key} href={hrefCategorie(catalogRoot, c.name)}
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
