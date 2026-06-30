export type StoreMode = "catalog" | "one_product";

export interface StoreModeConfig {
  /** Resolved display mode. "one_product" only when a product is actually chosen. */
  mode: StoreMode;
  /** The chosen main product id (null in catalog mode or when unset). */
  productId: string | null;
}

/**
 * Resolve a store's display mode from store_settings.page_content (JSONB).
 *
 * Defaults to "catalog". "one_product" (One Product Store) requires BOTH the flag
 * and a selected product id — a half-configured OPS falls back to the catalog so
 * the storefront never renders a broken/empty homepage.
 */
export function parseStoreMode(pageContent: unknown): StoreModeConfig {
  const pc = (pageContent ?? null) as { store_mode?: unknown; one_product_id?: unknown } | null;
  const productId =
    typeof pc?.one_product_id === "string" && pc.one_product_id.trim() ? pc.one_product_id : null;
  const mode: StoreMode = pc?.store_mode === "one_product" && productId ? "one_product" : "catalog";
  return { mode, productId };
}

/**
 * Variant for the nested `store_settings(page_content)` shape returned by joined
 * selects (Supabase returns the relation as an object or a single-element array).
 */
export function parseStoreModeFromSettings(storeSettings: unknown): StoreModeConfig {
  const ss = storeSettings as { page_content?: unknown } | { page_content?: unknown }[] | null | undefined;
  if (!ss) return { mode: "catalog", productId: null };
  const pc = (Array.isArray(ss) ? ss[0] : ss)?.page_content ?? null;
  return parseStoreMode(pc);
}
