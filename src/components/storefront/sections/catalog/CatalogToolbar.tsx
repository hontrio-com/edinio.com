"use client";

import { ArrowUpDown, ChevronDown, Filter, Search, X } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { CatalogFilterFields } from "./CatalogFilterFields";

/**
 * Bara de deasupra catalogului: cautare, sortare si filtre.
 *
 * Filtrele se deschid ca panou inline pe desktop si ca foaie de jos pe mobil,
 * cu aceleasi campuri. „Relevanta" apare in sortare doar cat timp exista o
 * cautare activa.
 */
export function CatalogToolbar() {
  const {
    color,
    search,
    setSearch,
    setSortTouched,
    setSort,
    effectiveSort,
    hasSearchMatches,
    filtersOpen,
    setFiltersOpen,
    activeFilterCount,
    resetFilters,
    filteredProducts,
    headerHasSearch,
  } = useStorefront();

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Cand header-ul are deja o caseta de cautare, aici ar fi a doua. */}
        {!headerHasSearch && (
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Cauta produse..."
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                // O cautare noua porneste inapoi pe ordonarea dupa relevanta.
                if (search === "" && v !== "") setSortTouched(false);
                setSearch(v);
              }}
              className="w-full pl-10 pr-4 py-3 text-sm border border-border rounded-2xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            />
          </div>
        )}

        {/* Sirul de clase e scris intreg pe fiecare ramura, nu compus dintr-o
            parte fixa si una variabila: asa cazul obisnuit da exact marcajul de
            dinainte, iar comparatia cu productia nu semnaleaza o simpla
            reordonare de clase drept diferenta. */}
        <div className={headerHasSearch
          ? "relative flex-1 md:flex-none md:w-auto shrink-0"
          : "relative w-full md:w-auto shrink-0"}>
          <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <select aria-label="Sorteaza produsele" value={effectiveSort}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "relevance") setSortTouched(false);
              else { setSort(v); setSortTouched(true); }
            }}
            style={{ WebkitAppearance: "none", MozAppearance: "none" }}
            className="h-[46px] w-full md:w-auto appearance-none cursor-pointer pl-10 pr-9 text-sm border border-border rounded-2xl bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
            {hasSearchMatches && <option value="relevance">Relevanta</option>}
            <option value="newest">Cele mai noi</option>
            <option value="price_asc">Pret crescator</option>
            <option value="price_desc">Pret descrescator</option>
            <option value="popular">Populare</option>
            <option value="name_asc">Alfabetic A-Z</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>

        <button type="button" onClick={() => setFiltersOpen(!filtersOpen)}
          className="h-[46px] px-4 w-full md:w-auto justify-center inline-flex items-center gap-2 text-sm border border-border rounded-2xl bg-surface hover:bg-muted transition-colors"
          style={filtersOpen || activeFilterCount > 0 ? { borderColor: color, color } : { color: "var(--color-foreground)" }}>
          <Filter className="h-4 w-4" />
          Filtre
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Desktop: panou inline */}
      {filtersOpen && (
        <div className="hidden md:block mb-6 rounded-2xl border border-border bg-surface p-4 space-y-4">
          <CatalogFilterFields />
          {activeFilterCount > 0 && (
            <button type="button" onClick={resetFilters}
              className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2">
              Reseteaza filtrele
            </button>
          )}
        </div>
      )}

      {/* Mobil: foaie de jos */}
      {filtersOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFiltersOpen(false)} />
          <div className="relative bg-surface rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-base font-semibold text-foreground">
                Filtre{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </p>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Inchide"
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <CatalogFilterFields />
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
              <button type="button" onClick={resetFilters}
                className="px-4 py-2.5 text-sm font-medium border border-border rounded-xl text-foreground hover:bg-muted transition-colors">
                Reseteaza
              </button>
              <button type="button" onClick={() => setFiltersOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-opacity hover:opacity-90"
                style={{ backgroundColor: color }}>
                Vezi {filteredProducts.length} {filteredProducts.length === 1 ? "produs" : "produse"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
