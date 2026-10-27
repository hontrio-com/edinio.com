import type { Block } from "@/lib/pages/blocks.types";
import { findBlock } from "@/lib/pages/block-tree";
import { citestePaginaAcasa } from "@/lib/pages/pagina-acasa";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import { shopOnPage } from "./commerce";
import { blocuriLaCale, type CaleContinut } from "./edit";
import { aplicaPaginaAcasa } from "./pagina-acasa";
import type { StoreDesign } from "./types";

/**
 * Un bloc dintr-un „Conținut liber” care se VEDE in magazin (etapa 9 din `docs/editor-magazin/PLAN.md`),
 * cu locul lui in cuvinte. Il cauta serverul cand un client trimite formularul de contact sau
 * newsletterul unui astfel de bloc: la paginile proprii pagina trebuia sa fie publicata, aici
 * containerul trebuie sa apara chiar in magazin, cu aceleasi reguli ca randarea:
 *  - pe pagina principala, sectiunea aprinsa, si numai cand pagina principala e cea cu sectiuni (nu
 *    o pagina proprie aleasa in locul ei, nici magazinul cu un singur produs);
 *  - sub produs, blocul aprins, pe pagina de produs Implicita sau a unui sablon;
 *  - pe Pagina Magazin, blocul aprins, cand magazinul chiar are pagina aceea.
 *
 * ⚠ `design` trebuie sa fie cel PUBLICAT: un formular din ciorna n-are voie sa primeasca mesaje.
 * Functie pura, fara baza: actiunile citesc designul, aici se hotaraste.
 */
export function blocDinMagazin(
  design: StoreDesign,
  pageContent: Record<string, unknown>,
  cale: CaleContinut,
  idBloc: string,
): { bloc: Block; loc: string } | null {
  const loc = locContinut(aplicaPaginaAcasa(design, pageContent), pageContent, cale);
  if (!loc) return null;
  const blocuri = blocuriLaCale(design, cale);
  const bloc = blocuri ? findBlock(blocuri, idBloc) : null;
  return bloc ? { bloc, loc } : null;
}

function locContinut(design: StoreDesign, pageContent: Record<string, unknown>, cale: CaleContinut): string | null {
  const acasa = design.home.find((s) => s.id === cale.sectiune);
  if (acasa) {
    if (cale.bloc !== null || acasa.kind !== "continut_liber" || !acasa.enabled) return null;
    if (citestePaginaAcasa(pageContent) || parseStoreMode(pageContent).mode === "one_product") return null;
    return "Pagina principală";
  }
  if (cale.bloc === null) return null;
  const sablon = design.product.sabloane?.find((s) => s.page.id === cale.sectiune);
  const paginaProdus = design.product.page.id === cale.sectiune ? design.product.page : sablon?.page;
  if (paginaProdus) {
    if (!paginaProdus.blocks?.find((b) => b.id === cale.bloc)?.enabled) return null;
    return sablon ? `Pagina de produs (${sablon.nume})` : "Pagina de produs";
  }
  if (design.shop.page.id === cale.sectiune) {
    if (!shopOnPage(design) || !design.shop.page.blocks?.find((b) => b.id === cale.bloc)?.enabled) return null;
    return "Pagina Magazin";
  }
  return null;
}
