import type { Block } from "@/lib/pages/blocks.types";
import { findBlock } from "@/lib/pages/block-tree";
import { citestePaginaAcasa } from "@/lib/pages/pagina-acasa";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import { esteContinut, schemaBlocurilor } from "./blocuri";
import { shopOnPage } from "./commerce";
import { blocuriDinSetari } from "./continut-liber";
import { blocuriLaCale, type CaleContinut } from "./edit";
import { aplicaPaginaAcasa } from "./pagina-acasa";
import type { SectionInstance, StoreDesign } from "./types";

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

/** Un „Conținut liber” de randat: calea lui (cheia slotului, `caleInText`) si blocurile lui. */
export interface ContinutDeRandat {
  cale: CaleContinut;
  blocuri: Block[];
}

/** Continuturile aprinse si cu blocuri de pe pagina principala, in ordinea sectiunilor. */
export function continuturiAcasa(home: readonly SectionInstance[]): ContinutDeRandat[] {
  return home
    .filter((s) => s.kind === "continut_liber" && s.enabled)
    .map((s) => ({ cale: { sectiune: s.id, bloc: null }, blocuri: blocuriDinSetari(s.settings) }))
    .filter((c) => c.blocuri.length > 0);
}

/** Continuturile aprinse si cu blocuri ale unei sectiuni cu blocuri (pagina de produs, Pagina Magazin). */
export function continuturiSectiunii(s: SectionInstance): ContinutDeRandat[] {
  const schema = schemaBlocurilor(s.kind, s.variant);
  if (!schema) return [];
  return (s.blocks ?? [])
    .filter((b) => b.enabled && esteContinut(schema, b.type))
    .map((b) => ({ cale: { sectiune: s.id, bloc: b.id }, blocuri: blocuriDinSetari(b.settings) }))
    .filter((c) => c.blocuri.length > 0);
}

/** Toate continuturile de randat ale designului: pagina principala, pagina de produs si sabloanele ei, Pagina Magazin. */
export function toateContinuturileDeRandat(design: StoreDesign): ContinutDeRandat[] {
  return [
    ...continuturiAcasa(design.home),
    ...continuturiSectiunii(design.product.page),
    ...(design.product.sabloane ?? []).flatMap((s) => continuturiSectiunii(s.page)),
    ...continuturiSectiunii(design.shop.page),
  ];
}

/** Ale paginii principale (sectiunile `continut_liber`). */
export function continuturiPeAcasa(toate: readonly ContinutDeRandat[]): ContinutDeRandat[] {
  return toate.filter((c) => c.cale.bloc === null);
}

/** Ale unei sectiuni cu blocuri: pagina de produs (Implicita sau a unui sablon), Pagina Magazin. */
export function continuturiInSectiune(toate: readonly ContinutDeRandat[], idSectiune: string): ContinutDeRandat[] {
  // Id-urile de sectiune sunt unice in tot designul, deci sectiunea ajunge.
  return toate.filter((c) => c.cale.sectiune === idSectiune);
}

/**
 * Designul care pleaca la CLIENT (ca prop in `MiniStoreRenderer`, `StorePageShell`, `buildChromeData`):
 * containerele raman (locul, ochiul, ordinea lor), blocurile lor nu.
 *
 * ⚠ Fara asta, FIECARE pagina a magazinului ducea in datele ei (RSC) toate blocurile tuturor
 * paginilor, pana la plafonul de 200 KB, necuratate (vazut la proba 9.3: textul de pe pagina
 * principala si de pe Pagina Magazin, cu un `<img onerror>` de proba, in pagina unui produs). Clientul
 * nu le foloseste: pe magazin randeaza slotul facut pe server, iar in editor blocurile trimise de editor.
 */
export function faraBlocuriLibere(design: StoreDesign): StoreDesign {
  const golesteSectiunea = (s: SectionInstance): SectionInstance => (s.kind === "continut_liber" ? { ...s, settings: {} } : s);
  const golesteBlocurile = (s: SectionInstance): SectionInstance => {
    const schema = schemaBlocurilor(s.kind, s.variant);
    if (!schema || !s.blocks) return s;
    return { ...s, blocks: s.blocks.map((b) => (esteContinut(schema, b.type) ? { ...b, settings: {} } : b)) };
  };
  const { sabloane } = design.product;
  return {
    ...design,
    home: design.home.map(golesteSectiunea),
    product: {
      ...design.product,
      page: golesteBlocurile(design.product.page),
      ...(sabloane ? { sabloane: sabloane.map((s) => ({ ...s, page: golesteBlocurile(s.page) })) } : {}),
    },
    shop: { ...design.shop, page: golesteBlocurile(design.shop.page) },
  };
}

/**
 * Randul `store_settings` care pleaca la client, fara coloana de design BRUT. Rutele o citesc ca s-o
 * rezolve pe server (`resolveDesign`); clientul primeste designul rezolvat, deci coloana nu-i trebuie, iar
 * cu „Conținut liber” ar fi dus in HTML toate blocurile tuturor paginilor, necuratate.
 */
export function faraDesignulBrut<T extends Record<string, unknown>>(rand: T | null | undefined): Omit<T, "storefront_design"> | null {
  if (!rand) return null;
  const copie: Record<string, unknown> = { ...rand };
  delete copie.storefront_design;
  return copie as Omit<T, "storefront_design">;
}
