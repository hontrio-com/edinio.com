"use client";

import { useStorefront } from "@/components/storefront/StorefrontProvider";
import {
  AntetPagina, CategoriiSus, CautareCatalog, FiltreActive, FiltrePeTelefon,
  GrilaProduse, NumarRezultate, Paginare, PanouFiltre, Sortare,
} from "./_shared/ShopPieces";
import type { ShopPageProps } from "./shop-page.types";

/**
 * Pagina de catalog, modelul „Compact".
 *
 * Pentru cataloage mari: bara laterala mai ingusta, grila mai densa, si o bara
 * de unelte lipita sub header care ramane la vedere cat timp vizitatorul
 * deruleaza. La o suta de produse pe pagina, sortarea si numarul de rezultate
 * plecate din capul paginii sunt de negasit fara sa derulezi inapoi.
 *
 * Nu are container: pe ecrane late, densitatea e chiar rostul modelului, iar o
 * grila stramtata la mijloc ar fi anulat-o.
 */
export function ShopPageCompact({ titlu, coloane, grupuriPornite, arataTitlu }: ShopPageProps) {
  const { fatete } = useStorefront();
  const areFiltre = fatete.length > 0;

  return (
    <div className="px-4 py-6 xl:px-8">
      <div className="mb-4 space-y-3">
        <AntetPagina titlu={titlu} aratatTitlu={arataTitlu} />
        <div className="max-w-xl"><CautareCatalog /></div>
        <CategoriiSus />
      </div>

      <div className={areFiltre ? "flex gap-6 items-start" : ""}>
        {areFiltre && (
          <aside className="hidden xl:block w-52 shrink-0 sticky"
            style={{ top: "calc(var(--st-header-offset, 100px) + 1rem)" }}>
            <PanouFiltre grupuriPornite={grupuriPornite} />
          </aside>
        )}

        <div className="flex-1 min-w-0">
          {/*
            Bara lipita sub header: `--st-header-offset` e inaltimea header-ului
            ales, cu bara de anunt inclusa. Un decalaj scris de mana ar fi bagat
            bara sub header la sase din cele opt variante.
          */}
          <div className="sticky z-20 -mx-4 px-4 py-2.5 bg-[var(--st-bg)]/95 backdrop-blur-sm border-b border-[var(--st-border)] mb-4"
            style={{ top: "var(--st-header-offset, 100px)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {areFiltre && <span className="xl:hidden"><FiltrePeTelefon grupuriPornite={grupuriPornite} /></span>}
                <NumarRezultate />
              </div>
              <Sortare />
            </div>
          </div>

          <div className="mb-4"><FiltreActive /></div>
          <GrilaProduse coloane={coloane} />
          <Paginare />
        </div>
      </div>
    </div>
  );
}
