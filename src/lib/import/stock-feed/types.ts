// Feed de actualizare a stocurilor.
//
// Conducta e separata de importul de produse, INTENTIONAT. Un feed de stoc nu
// trebuie sa poata crea produse si nu trebuie sa atinga nume, descriere,
// imagini sau categorii. Ca mod separat, codul nu are cum: mai jos nu exista
// niciun camp in care sa incapa asa ceva.

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
  stock_quantity: number;
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

export type StockRowProblem = "not_found" | "ambiguous" | "invalid" | "duplicate";

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
