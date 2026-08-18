// Feed de actualizare a stocurilor.
//
// Conducta e separata de importul de produse, INTENTIONAT. Un feed de stoc nu
// trebuie sa poata crea produse si nu trebuie sa atinga nume, descriere,
// imagini sau categorii. Ca mod separat, codul nu are cum: mai jos nu exista
// niciun camp in care sa incapa asa ceva.

/**
 * Dupa atatea esecuri la rand, sursa se dezactiveaza singura.
 *
 * Sta AICI, nu in `sources.ts`, fiindca o are nevoie si ecranul, care e
 * componenta de client. `sources.ts` importa `error-logger`, care importa
 * clientul de ADMINISTRARE: azi lantul e taiat de tree-shaking (verificat in
 * `.next/static/chunks`, nu presupus), dar prima folosire a oricarui alt export
 * din `sources.ts` l-ar trage intreg in pachetul de browser. Acelasi motiv
 * pentru care exista `tabular-formats.ts` separat de `tabular.ts`.
 */
export const MAX_FAILURES = 5;

/** Dupa ce se potriveste un rand din feed cu un produs din catalog. */
export type StockMatchKey =
  /** SKU-ul produsului sau al unei variante. Prima potrivire castiga. */
  | "sku_auto"
  /** Doar SKU-ul produsului. */
  | "sku"
  /** Doar SKU-ul unei variante. */
  | "variant_sku"
  /** Identificatorul intern Edinio (uuid). */
  | "product_id"
  /** Identificatorul din platforma de unde s-a importat prima data. */
  | "external_id"
  /** Cod EAN / cod de bare. */
  | "gtin";

export const MATCH_KEY_LABELS: Record<StockMatchKey, string> = {
  sku_auto: "SKU (produs sau varianta)",
  sku: "SKU produs",
  variant_sku: "SKU varianta",
  product_id: "ID Edinio",
  external_id: "ID extern",
  gtin: "Cod EAN",
};

/** Un rand citit din fisier, deja curatat. */
export interface StockFeedRow {
  /** Numarul randului din fisier, incepand de la 1. Pentru raportul de erori. */
  rowIndex: number;
  identifier: string;
  /** `null` cand coloana lipseste sau e goala. */
  stock: number | null;
  /** `null` cand coloana de pret nu e mapata. Scrie preturi doar cand e mapata. */
  price: number | null;
}

/** O varianta, scoasa din `page_sections.variants.combinations`. */
export interface CatalogVariant {
  id: string;
  title: string;
  sku: string | null;
  /** Cod de bare propriu. 9.991 din 47.314 de combinatii au unul. */
  gtin: string | null;
  /**
   * Combinatia e aprinsa in magazin.
   *
   * 8.313 din 47.314 sunt stinse. Declansatorul de suma din Postgres numara DOAR
   * combinatiile aprinse, deci un stoc scris intr-una stinsa nu se vede nicaieri:
   * nici pe pagina, nici in totalul produsului.
   */
  enabled: boolean;
  stock_quantity: number;
  /**
   * Stocul din JSON e un NUMAR curat, dupa masura declansatorului din Postgres
   * (`^\s*\d+(\.\d+)?\s*$`).
   *
   * Declansatorul recalculeaza suma DOAR daca toate combinatiile aprinse trec
   * proba asta. Unde nu trec, coloana de stoc a produsului ramane a noastra si
   * o scriere pe produs chiar tine — 351 de produse in productie.
   */
  stockNumeric: boolean;
  price: number;
}

/** Un produs din catalog, doar cu ce ii trebuie potrivirii. */
export interface CatalogEntry {
  id: string;
  name: string;
  sku: string | null;
  external_id: string | null;
  gtin: string | null;
  price: number;
  stock_quantity: number | null;
  track_inventory: boolean;
  /**
   * Blocul de variante e pornit pe produs.
   *
   * Cand e pornit si are macar o combinatie aprinsa, `products.stock_quantity`
   * NU mai e al nostru: declansatorul `products_sync_variant_stock` il
   * recalculeaza ca suma combinatiilor. O scriere pe produs pare ca reuseste si
   * chiar ramane — pana cand se atinge orice varianta, si atunci dispare.
   */
  variantsEnabled: boolean;
  variants: CatalogVariant[];
}

/** O scriere care chiar are ce schimba. */
export interface StockChange {
  rowIndex: number;
  /** Codul din fisier. Ajunge in raportul de erori, ca omul sa stie ce rand. */
  identifier: string;
  productId: string;
  productName: string;
  /** `null` cand se schimba stocul produsului, nu al unei variante. */
  variantId: string | null;
  /**
   * SKU-ul combinatiei tintite.
   *
   * Exista pentru ca `id`-ul unei combinatii NU e unic in produs: e un slug facut
   * din optiuni ("galben-unic"), deci doua combinatii diferite pot ajunge cu
   * acelasi id. Intr-un magazin real sunt 52 de produse asa. Fara SKU aici,
   * scrierea nimereste toate combinatiile cu acel id, cu aceeasi valoare.
   */
  variantSku: string | null;
  variantTitle: string | null;
  stockFrom: number | null;
  /** `null` cand randul schimba doar pretul. */
  stockTo: number | null;
  priceFrom: number | null;
  /** `null` cand randul nu schimba pretul. */
  priceTo: number | null;
  /**
   * Produsul are urmarirea stocului oprita, deci scrierea nu se vede in magazin.
   * Se scrie oricum, dar omul trebuie avertizat: altfel crede ca a rezolvat.
   */
  inventoryOff: boolean;
}

/**
 * `ignored` = randul s-a potrivit, dar scrierea n-ar ajunge nicaieri.
 *
 * Nu e „negasit" (codul EXISTA in magazin) si nu e „invalid" (valoarea din
 * fisier e in regula). Fara o categorie a lui, un asemenea rand ar fi fost
 * numarat ca reusita, iar comerciantul ar fi crezut ca si-a rezolvat stocul.
 *
 * ⚠ CUPLAT: cand adaugi un tip aici, adauga-l si in `StockTotals`
 * (`committer.ts`), in `EMPTY_STOCK_TOTALS`, in cele DOUA obiecte `byProblem`
 * (`matcher.ts` si `committer.ts`) si in ecranele din `StockFeedWizard.tsx` si
 * `StockFeedSources.tsx`.
 */
export type StockRowProblem = "not_found" | "ambiguous" | "invalid" | "duplicate" | "ignored";

export interface StockRowIssue {
  rowIndex: number;
  identifier: string;
  problem: StockRowProblem;
  detail: string;
}

/** Ce se va intampla, calculat inainte de orice scriere. */
export interface StockPlan {
  changes: StockChange[];
  /** Randuri potrivite, dar cu aceleasi valori. Nu se scriu. */
  unchanged: number;
  issues: StockRowIssue[];
  /** Cate randuri au fost citite din fisier. */
  totalRows: number;
}

/** Coloanele pe care le poate mapa un feed de stoc. Atat, nimic mai mult. */
export type StockFeedField = "identifier" | "stock" | "price";

export interface StockFeedMapping {
  identifier?: string;
  stock?: string;
  price?: string;
}

export interface StockFeedOptions {
  match_key: StockMatchKey;
  /** Scrie preturi doar daca e pornit SI coloana de pret e mapata. */
  update_price: boolean;
}

export const DEFAULT_STOCK_OPTIONS: StockFeedOptions = {
  match_key: "sku_auto",
  update_price: false,
};
