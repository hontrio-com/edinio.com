"use client";

import { useEffect, useRef } from "react";
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
    asezareMagazin,
    filtersOpen,
    setFiltersOpen,
    activeFilterCount,
    resetFilters,
    headerHasSearch,
    catalogPeServer,
    trimiteCautarea,
    isHome,
    pageContent,
    totalVizibile,
    totalFiltrate,
  } = useStorefront();

  /*
   * Sortarea si filtrele se pot stinge, dar NUMAI pe prima pagina.
   *
   * Magazinele care au si pagina `/magazin` le au deja acolo, cu tot cu fatete;
   * aici raman doua controale care ocupa un rand intreg fara sa adauge nimic.
   * Pe `/magazin` reglajele astea nu se citesc deloc — bara de acolo e alta
   * componenta, cu setarile ei — iar conditia pe `isHome` face asta explicit,
   * ca sa nu se stinga din greseala tocmai unde filtrele sunt rostul paginii.
   */
  const arataSortarea = !isHome || pageContent.sort_options?.enabled !== false;
  const arataFiltrele = !isHome || pageContent.filter_options?.enabled !== false;

  /*
   * Cate produse se vad acum, cand cautarea sta in header.
   *
   * Fara caseta locala, randul ramanea cu doua controale mici lipite in stanga
   * si o jumatate de rand goala. Contorul umple locul cu singurul lucru care
   * merita citit acolo: cate produse a mai lasat filtrarea. Pe telefon nu se
   * arata — acolo latimea e oricum ocupata de sortare si de butonul de filtre.
   */
  // Numerele, nu lungimile: pe palierul server listele au doar pagina curenta.
  const total = totalVizibile;
  const aratate = totalFiltrate;
  const contor = aratate === total
    ? `${total} ${total === 1 ? "produs" : "produse"}`
    : `${aratate} din ${total} ${total === 1 ? "produs" : "produse"}`;

  /*
   * Cu sortarea si filtrele stinse, si cu cautarea deja in header, in rand nu mai
   * ramane decat contorul — iar acela e ascuns pe telefon. Randul ar fi ramas o
   * fasie goala cu marginea lui de jos, adica exact spatiul pe care comerciantul
   * a vrut sa-l recupereze. Cand nu mai e nimic de aratat, nu se randeaza nimic.
   */
  if (headerHasSearch && !arataSortarea && !arataFiltrele) return null;

  return (
    <>
      <div className={headerHasSearch
        ? "flex items-center gap-3 mb-5"
        : "flex flex-wrap items-center gap-3 mb-5"}>
        {/* Cand header-ul are deja o caseta de cautare, aici ar fi a doua. */}
        {headerHasSearch && (
          <span className="hidden md:block flex-1 min-w-0 truncate text-sm text-muted-foreground">
            {contor}
          </span>
        )}
        {!headerHasSearch && (
          /*
           * Formular, nu doar o caseta: pe palierul server cautarea se aplica la o
           * CERERE, nu la fiecare tasta, deci Enter trebuie sa insemne ceva. Pe
           * palierul client `trimiteCautarea` nu face nimic, dar `preventDefault`
           * e oricum necesar ca trimiterea implicita sa nu reincarce pagina.
           */
          <form role="search" className="relative flex-1 min-w-[180px]"
            onSubmit={(e) => { e.preventDefault(); trimiteCautarea(); }}>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder={catalogPeServer ? "Cauta produse, apoi Enter..." : "Cauta produse..."}
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                // O cautare noua porneste inapoi pe ordonarea dupa relevanta.
                if (search === "" && v !== "") setSortTouched(false);
                setSearch(v);
              }}
              className="w-full pl-10 pr-4 py-3 text-sm border border-border rounded-2xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            />
          </form>
        )}

        {/* Sirul de clase e scris intreg pe fiecare ramura, nu compus dintr-o
            parte fixa si una variabila: asa cazul obisnuit da exact marcajul de
            dinainte, iar comparatia cu productia nu semnaleaza o simpla
            reordonare de clase drept diferenta. */}
        {arataSortarea && (
        <div className={headerHasSearch
          ? "relative flex-1 md:flex-none md:w-auto shrink-0"
          : "relative w-full md:w-auto shrink-0"}>
          <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <select aria-label="Sorteaza produsele" value={effectiveSort}
            onChange={(e) => {
              const v = e.target.value;
              /*
               * „Relevanta" si asezarea magazinului inseamna AMANDOUA „nicio
               * sortare ceruta de mine", deci amandoua sting `sortTouched`.
               *
               * ⚠ Tratata ca o sortare obisnuita, asezarea diverge intre paliere:
               * `sortTouched` ar fi ramas aprins, adresa n-ar fi purtat-o (cititorul
               * o arunca), iar la intoarcerea de la server steagul s-ar fi stins
               * oricum. Pe palierul client alegerea se vedea, pe cel server sarea
               * inapoi pe „Relevanta" in timpul unei cautari — acelasi magazin, doua
               * purtari, dupa marimea catalogului.
               */
              if (v === "relevance") setSortTouched(false);
              else if (v === asezareMagazin) { setSort(v); setSortTouched(false); }
              else { setSort(v); setSortTouched(true); }
            }}
            style={{ WebkitAppearance: "none", MozAppearance: "none" }}
            className="h-[46px] w-full md:w-auto appearance-none cursor-pointer pl-10 pr-9 text-sm border border-border rounded-2xl bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
            {hasSearchMatches && <option value="relevance">Relevanta</option>}
            {/*
              * Asezarea magazinului, cand comerciantul a ales una care nu e o
              * sortare obisnuita. Sta PRIMA fiindca e ordinea implicita a paginii.
              *
              * Fara ea, `<select value="random">` n-ar fi avut nicio optiune
              * potrivita si s-ar fi randat gol — iar vizitatorul care alege alta
              * sortare n-ar mai fi avut cum sa se intoarca la ordinea magazinului.
              */}
            {asezareMagazin === "random" && <option value="random">Amestecat</option>}
            {asezareMagazin === "manual" && <option value="manual">Recomandarea magazinului</option>}
            <option value="newest">Cele mai noi</option>
            <option value="price_asc">Pret crescator</option>
            <option value="price_desc">Pret descrescator</option>
            <option value="popular">Populare</option>
            <option value="name_asc">Alfabetic A-Z</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
        )}

        {arataFiltrele && (
        <button type="button" onClick={() => setFiltersOpen(!filtersOpen)}
          className={headerHasSearch
            ? "h-[46px] px-4 shrink-0 justify-center inline-flex items-center gap-2 text-sm border border-border rounded-2xl bg-surface hover:bg-muted transition-colors"
            : "h-[46px] px-4 w-full md:w-auto justify-center inline-flex items-center gap-2 text-sm border border-border rounded-2xl bg-surface hover:bg-muted transition-colors"}
          style={filtersOpen || activeFilterCount > 0 ? { borderColor: color, color } : { color: "var(--color-foreground)" }}>
          <Filter className="h-4 w-4" />
          Filtre
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
              {activeFilterCount}
            </span>
          )}
        </button>
        )}
      </div>

      {/* Desktop: panou inline */}
      {arataFiltrele && filtersOpen && (
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

      {/* Mobil: foaie de jos. Si ea gateata pe reglaj: filtrele pot ramane
          deschise in stare de la o navigare anterioara, iar foaia ar fi aparut
          peste o pagina care nu mai are butonul de inchidere. */}
      {arataFiltrele && filtersOpen && <FoaieFiltre onClose={() => setFiltersOpen(false)} />}
    </>
  );
}

/**
 * Foaia de filtre de pe mobil.
 *
 * Se declara `aria-modal`, deci trebuie sa si fie: Escape inchide, Tab ramane
 * inauntru, iar la inchidere focusul se intoarce pe butonul care a deschis-o.
 * Fara asta, cu foaia deschisa Tab plimba focusul prin catalogul acoperit.
 *
 * Acelasi `filtersOpen` deschide si panoul inline de pe desktop, care nu e
 * modal si unde foaia e doar ascunsa din CSS: de aceea derularea paginii se
 * blocheaza numai cand foaia chiar se vede.
 */
function FoaieFiltre({ onClose }: { onClose: () => void }) {
  const { color, activeFilterCount, resetFilters, totalFiltrate } = useStorefront();
  const panou = useRef<HTMLDivElement>(null);
  // Parintele da un `onClose` nou la fiecare randare; tinut intr-un ref, efectul
  // de mai jos ramane pe montare.
  const inchide = useRef(onClose);
  useEffect(() => { inchide.current = onClose; }, [onClose]);

  useEffect(() => {
    const inainte = document.activeElement as HTMLElement | null;
    panou.current?.focus();
    const peMobil = window.matchMedia("(max-width: 767px)").matches;
    if (peMobil) document.body.style.overflow = "hidden";
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
      if (peMobil) document.body.style.overflow = "";
      inainte?.focus();
    };
  }, []);

  return (
    <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={panou} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="catalog-filtre-titlu"
        className="relative bg-surface rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p id="catalog-filtre-titlu" className="text-base font-semibold text-foreground">
            Filtre{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </p>
          <button type="button" onClick={onClose} aria-label="Inchide"
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
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-opacity hover:opacity-90"
            style={{ backgroundColor: color }}>
            Vezi {totalFiltrate} {totalFiltrate === 1 ? "produs" : "produse"}
          </button>
        </div>
      </div>
    </div>
  );
}
