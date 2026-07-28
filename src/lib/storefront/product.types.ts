import type { PriceRange } from "@/lib/utils/product-price";
import type { Database } from "@/types/database.types";

/**
 * Produsul asa cum il vede storefrontul: subsetul de coloane pe care le trimite
 * homepage-ul in browser, plus intervalul de pret precalculat server-side.
 *
 * Forma asta era declarata local in `MiniStoreRenderer`. A fost mutata aici ca
 * sectiunile extrase (cardul de produs, randurile, grila) sa poata fi importate
 * fara sa depinda de fisierul de 2900 de linii.
 *
 * `price_range` e optional pentru ca apelantii care trimit `page_sections`
 * complet (pagina de produs, blocurile din page-builder) il pot deriva local.
 * Detalii in lib/storefront/catalog-slim.ts.
 */
export type StorefrontProduct = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  | "id"
  | "name"
  | "slug"
  | "description"
  | "price"
  | "compare_at_price"
  | "images"
  | "category"
  | "is_featured"
  | "is_active"
  | "is_bundle"
  | "track_inventory"
  | "stock_quantity"
  | "sort_order"
  | "created_at"
  | "business_id"
  | "page_sections"
  | "weight_grams"
> & {
  price_range?: PriceRange;
};
