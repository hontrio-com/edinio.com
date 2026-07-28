"use client";

import {
  AntetPagina, ImagineAntet, TextSubGrila, CategoriiSus, CautareCatalog, FiltreActive, FiltrePeTelefon,
  GrilaProduse, NumarRezultate, Paginare, PanouFiltre, Sortare, useAreFiltre,
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
export function ShopPageCompact({ titlu, coloane, coloaneMobil, grupuriPornite, arataTitlu }: ShopPageProps) {
  const areFiltre = useAreFiltre(grupuriPornite);

  return (
    <div className="px-4 py-6 xl:px-8">
      <div className="mb-4 space-y-3">
        <ImagineAntet />
        <AntetPagina titlu={titlu} aratatTitlu={arataTitlu} />
        <div className="max-w-xl"><CautareCatalog /></div>
        {/*
          Doar cand comerciantul a pornit grupul, si doar cand ele nu apar deja
          in bara laterala: altfel aceleasi categorii se randau de doua ori pe
          ecran lat, iar stingerea grupului din editor nu le scotea pe niciuna.
        */}
        {grupuriPornite.includes("categorii") && (
          <div className={areFiltre ? "xl:hidden" : ""}><CategoriiSus /></div>
        )}
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
                {/*
                  `panaLa="xl"`: bara laterala apare abia de la 1280 px, deci pana
                  acolo butonul si foaia trebuie sa se vada AMANDOUA. Fara asta,
                  intre 1024 si 1279 px butonul era vizibil dar foaia lui avea
                  `lg:hidden` — filtre complet inaccesibile pe exact latimea unui
                  laptop obisnuit.
                */}
                {areFiltre && <span className="xl:hidden"><FiltrePeTelefon grupuriPornite={grupuriPornite} panaLa="xl" /></span>}
                <NumarRezultate />
              </div>
              <Sortare />
            </div>
          </div>

          <div className="mb-4"><FiltreActive /></div>
          <GrilaProduse coloane={coloane} coloaneMobil={coloaneMobil} />
          <Paginare />
          <TextSubGrila />
        </div>
      </div>
    </div>
  );
}
