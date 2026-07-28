"use client";

import {
  AntetPagina, CautareCatalog, FiltreActive, FiltrePeTelefon, GrilaProduse,
  NumarRezultate, Paginare, PanouFiltre, Sortare, useAreFiltre,
} from "./_shared/ShopPieces";
import type { ShopPageProps } from "./shop-page.types";

/**
 * Pagina de catalog, modelul „Filtre in bara laterala".
 *
 * Asezarea implicita a magazinelor mari: filtrele stau permanent la vedere in
 * stanga, grila ocupa restul. Bara e `sticky`, ca la un catalog de o suta de
 * produse filtrele sa nu ramana in capul paginii dupa prima derulare.
 *
 * Pe telefon bara dispare cu totul si filtrele trec in foaia de jos: stivuite
 * deasupra grilei, ar fi impins produsele sub prima derulare, adica exact ce a
 * venit clientul sa vada.
 */
export function ShopPageSidebar({ titlu, coloane, grupuriPornite, arataTitlu }: ShopPageProps) {
  // Fara nimic de aratat, coloana ar fi o banda goala langa grila: magazinul
  // fara categorii si fara atribute completate primeste automat asezarea pe
  // toata latimea.
  const areFiltre = useAreFiltre(grupuriPornite);

  return (
    <div className="mx-auto px-4 py-8" style={{ maxWidth: "var(--st-container)" }}>
      <div className="mb-5 space-y-3">
        <AntetPagina titlu={titlu} aratatTitlu={arataTitlu} />
        <CautareCatalog />
      </div>

      <div className={areFiltre ? "flex gap-8 items-start" : ""}>
        {areFiltre && (
          <aside className="hidden lg:block w-60 shrink-0 sticky"
            style={{ top: "calc(var(--st-header-offset, 100px) + 1rem)" }}>
            <PanouFiltre grupuriPornite={grupuriPornite} />
          </aside>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              {areFiltre && <span className="lg:hidden"><FiltrePeTelefon grupuriPornite={grupuriPornite} /></span>}
              <NumarRezultate />
            </div>
            <Sortare />
          </div>
          <div className="mb-4"><FiltreActive /></div>
          <GrilaProduse coloane={coloane} />
          <Paginare />
        </div>
      </div>
    </div>
  );
}
