// Canonical shapes for the product import pipeline.
// Every source adapter (Shopify CSV, Woo CSV, generic CSV, ...) normalizes into
// StagedProduct[]; a single committer writes StagedProduct[] -> DB.

export type ImportSource = "shopify_csv" | "woo_csv" | "generic_csv";

export type ImportStatus =
  | "uploaded"
  | "mapping"
  | "validating"
  | "importing"
  | "rehosting_images"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

// Matches the stored page_sections.variants shape used by ProductForm / batch imports.
export interface StagedVariantOption {
  id: string; // slugified option name, e.g. "marime"
  name: string; // "Marime"
  values: string[]; // ["S", "M", "L"]
}

export interface StagedVariantCombination {
  id: string; // slug of the value tuple, e.g. "s-rosu"
  title: string; // "S / Rosu"
  price: number;
  sku: string;
  enabled: boolean;
  stock_quantity: number;
}

export interface StagedVariants {
  enabled: boolean;
  options: StagedVariantOption[];
  combinations: StagedVariantCombination[];
}

export interface StagedImage {
  src: string; // external URL at staging time; rewritten to R2 during rehost
  alt?: string;
  position?: number;
}

export interface StagedSpec {
  label: string;
  value: string;
}

export interface StagedQuantityTiers {
  enabled: boolean;
  mode: "fixed" | "percent";
  tier2_price: number;
  tier2_percent: number;
  tier2_badge: string;
  tier3_price: number;
  tier3_percent: number;
  tier3_badge: string;
}

export interface StagedDimensions {
  length: number;
  width: number;
  height: number;
}

export interface StagedProduct {
  external_id: string | null; // Shopify Handle / Woo SKU|ID, for dedupe + re-sync
  name: string;
  slug: string | null;
  description_html: string | null;
  price: number;
  compare_at_price: number | null;
  sku: string | null;
  category_path: string[]; // ["Imbracaminte", "Barbati", "Tricouri"]
  tags: string[];
  images: StagedImage[];
  track_inventory: boolean;
  stock_quantity: number | null;
  weight_grams: number | null;
  is_active: boolean;
  is_featured: boolean;
  variants: StagedVariants | null;
  seo: { title: string; description: string } | null;
  // Rich page_sections fields (generic CSV only; optional so preset adapters skip them).
  short_description?: string | null;
  stock_status?: "in_stock" | "out_of_stock" | "preorder" | null;
  low_stock_threshold?: number | null;
  dimensions?: StagedDimensions | null;
  specifications?: StagedSpec[];
  quantity_tiers?: StagedQuantityTiers | null;
}

// ── Fields the generic mapper can target ────────────────────────────────────
export type OurField =
  | "name"
  | "price"
  | "compare_at_price"
  | "description"
  | "sku"
  | "category"
  | "tags"
  | "images"
  | "stock_quantity"
  | "weight"
  | "is_active"
  | "is_featured"
  | "external_id"
  | "slug"
  | "seo_title"
  | "seo_description"
  | "short_description"
  | "stock_status"
  | "low_stock_threshold"
  | "dim_length"
  | "dim_width"
  | "dim_height"
  | "specifications"
  | "upsell_mode"
  | "upsell_qty2"
  | "upsell_qty2_badge"
  | "upsell_qty3"
  | "upsell_qty3_badge";

export interface FieldDef {
  key: OurField;
  label: string; // Romanian (UI)
  required: boolean;
  hint?: string;
}

export const OUR_FIELDS: FieldDef[] = [
  { key: "name", label: "Nume produs", required: true },
  { key: "price", label: "Pret", required: true },
  { key: "description", label: "Descriere", required: false },
  { key: "compare_at_price", label: "Pret vechi (taiat)", required: false },
  { key: "sku", label: "Cod produs (SKU)", required: false },
  { key: "category", label: "Categorie", required: false, hint: "Acceptam si cale ierarhica: Parinte > Copil" },
  { key: "tags", label: "Etichete", required: false, hint: "Separate prin virgula" },
  { key: "images", label: "Imagini (linkuri)", required: false, hint: "Mai multe linkuri separate prin virgula, | sau spatiu" },
  { key: "stock_quantity", label: "Stoc", required: false },
  { key: "weight", label: "Greutate", required: false, hint: "kg sau grame" },
  { key: "is_active", label: "Activ / Publicat", required: false },
  { key: "is_featured", label: "Recomandat", required: false },
  { key: "external_id", label: "ID extern (re-sincronizare)", required: false },
  { key: "slug", label: "Link produs (slug)", required: false },
  { key: "seo_title", label: "Titlu SEO", required: false },
  { key: "seo_description", label: "Descriere SEO", required: false },
  { key: "short_description", label: "Descriere scurta", required: false },
  { key: "stock_status", label: "Status stoc", required: false, hint: "in stoc / epuizat / precomanda" },
  { key: "low_stock_threshold", label: "Prag stoc redus", required: false },
  { key: "dim_length", label: "Lungime (cm)", required: false },
  { key: "dim_width", label: "Latime (cm)", required: false },
  { key: "dim_height", label: "Inaltime (cm)", required: false },
  { key: "specifications", label: "Specificatii", required: false, hint: "Eticheta: Valoare, separate prin | (ex: Material: Bumbac | Greutate: 200g)" },
  { key: "upsell_mode", label: "Upsell - mod", required: false, hint: "suma sau procent" },
  { key: "upsell_qty2", label: "Upsell 2 buc - valoare", required: false, hint: "pret/buc (suma) sau reducere % (procent)" },
  { key: "upsell_qty2_badge", label: "Upsell 2 buc - eticheta", required: false },
  { key: "upsell_qty3", label: "Upsell 3 buc - valoare", required: false },
  { key: "upsell_qty3_badge", label: "Upsell 3 buc - eticheta", required: false },
];

// Maps an OurField key to the source column header the user picked.
export type ColumnMapping = Partial<Record<OurField, string>>;

export interface ImportOptions {
  collapse_variants: boolean; // group variant rows into page_sections.variants
  import_images: boolean; // rehost remote images to R2 (vs keep external URLs)
  default_active: boolean; // mark imported products active (visible) in the store
  overwrite_existing: boolean; // upsert by external_id instead of always creating
  weight_unit: "kg" | "g" | "auto"; // generic CSV only
}

export const DEFAULT_OPTIONS: ImportOptions = {
  collapse_variants: true,
  import_images: true,
  default_active: true,
  overwrite_existing: false,
  weight_unit: "auto",
};

// ── Validation / reporting ──────────────────────────────────────────────────
export interface RowIssue {
  row_index: number;
  name: string;
  message: string;
}

export interface ValidationSummary {
  total: number;
  valid: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  newCategories: string[];
}

export interface ImportTotals {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  images_total: number;
  images_done: number;
}

export const EMPTY_TOTALS: ImportTotals = {
  total: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  images_total: 0,
  images_done: 0,
};

export interface ImportPreview {
  source: ImportSource;
  headers: string[];
  mapping: ColumnMapping; // suggested (generic) or empty (preset sources)
  sampleProducts: StagedProduct[]; // first few, for the review UI
  totalRows: number;
}
