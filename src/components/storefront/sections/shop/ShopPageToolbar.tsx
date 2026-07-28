"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import {
  AntetPagina, ImagineAntet, TextSubGrila, CategoriiSus, CautareCatalog, FiltreActive, FiltrePeTelefon,
  FiltreDeBaza, GrilaProduse, GrupFatete, NumarRezultate, Paginare, Sortare,
} from "./_shared/ShopPieces";
import type { ShopPageProps } from "./shop-page.types";

/**
 * Pagina de catalog, modelul „Filtre in capul paginii".
 *
 * Fiecare fateta e un buton care deschide un panou, iar grila primeste toata
 * latimea. Potrivit magazinelor cu putine atribute, unde o bara laterala ar fi
 * fost o coloana pe jumatate goala langa produse.
 *
 * Panourile se inchid la click in afara si la Escape, ca orice meniu: fara asta,
 * un panou deschis peste grila ramane acolo pana la o alta apasare si acopera
 * chiar produsele pe care tocmai le-a filtrat.
 */
function PanouFateta({ eticheta, copii, cateBifate }: { eticheta: string; copii: React.ReactNode; cateBifate: number }) {
  const [deschis, setDeschis] = useState(false);
  const zona = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!deschis) return;
    const laClick = (e: MouseEvent) => {
      if (!zona.current?.contains(e.target as Node)) setDeschis(false);
    };
    const laTasta = (e: KeyboardEvent) => { if (e.key === "Escape") setDeschis(false); };
    document.addEventListener("mousedown", laClick);
    document.addEventListener("keydown", laTasta);
    return () => {
      document.removeEventListener("mousedown", laClick);
      document.removeEventListener("keydown", laTasta);
    };
  }, [deschis]);

  return (
    <div ref={zona} className="relative">
      <button type="button" onClick={() => setDeschis((v) => !v)} aria-expanded={deschis}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] rounded-[var(--st-radius-sm)] border transition-colors"
        style={cateBifate > 0
          ? { borderColor: "var(--st-primary)", color: "var(--st-primary)", fontWeight: 600 }
          : { borderColor: "var(--st-border)", color: "var(--st-text)" }}>
        {eticheta}
        {cateBifate > 0 && <span className="tabular-nums">({cateBifate})</span>}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {deschis && (
        <div className="absolute left-0 top-full mt-2 z-30 w-64 max-h-[60vh] overflow-y-auto p-3.5 rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] shadow-xl">
          {copii}
        </div>
      )}
    </div>
  );
}

export function ShopPageToolbar({ titlu, coloane, coloaneMobil, grupuriPornite, arataTitlu }: ShopPageProps) {
  const { fatete, selectieFatete, priceMin, priceMax, onSaleOnly, inStockOnly } = useStorefront();
  const arata = (g: string) => grupuriPornite.includes(g);
  const numeGrup: Record<string, string> = {
    atribut: "atribute", brand: "brand", eticheta: "etichete", specificatie: "specificatii",
  };
  const vizibile = fatete.filter((f) => arata(numeGrup[f.grup]));

  return (
    <div className="mx-auto px-4 py-8" style={{ maxWidth: "var(--st-container)" }}>
      <div className="mb-5 space-y-3">
        <ImagineAntet />
        <AntetPagina titlu={titlu} aratatTitlu={arataTitlu} />
        <CautareCatalog />
        {arata("categorii") && <CategoriiSus />}
      </div>

      {/* Pe telefon butoanele s-ar fi inghesuit doua pe rand; acolo ramane foaia
          de jos, cu toate filtrele intr-un singur loc. */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 mb-4">
        {arata("pret") && (
          // Numarul e REAL, nu zero: butonul e singurul loc in care se vede ca
          // pretul, reducerile sau stocul sunt filtrate, iar codat pe zero nu se
          // colora niciodata si filtrul parea stins desi taia produse.
          <PanouFateta eticheta="Pret si stoc"
            cateBifate={(priceMin.trim() || priceMax.trim() ? 1 : 0) + (onSaleOnly ? 1 : 0) + (inStockOnly ? 1 : 0)}
            copii={<div className="space-y-4"><FiltreDeBaza /></div>} />
        )}
        {vizibile.map((f) => (
          <PanouFateta key={f.cheie} eticheta={f.eticheta}
            cateBifate={(selectieFatete[f.cheie] ?? []).length}
            copii={<GrupFatete fateta={f} />} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="lg:hidden"><FiltrePeTelefon grupuriPornite={grupuriPornite} /></span>
          <NumarRezultate />
        </div>
        <Sortare />
      </div>
      <div className="mb-4"><FiltreActive /></div>

      <GrilaProduse coloane={coloane} coloaneMobil={coloaneMobil} />
      <Paginare />
      <TextSubGrila />
    </div>
  );
}
