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
  /**
   * Indicii jetoanelor de fateta ale produsului, in dictionarul trimis alaturi.
   *
   * Prezenti doar pe pagina de catalog, care le cere explicit: brandul si
   * specificatiile nu supravietuiesc slimuirii payload-ului, deci se calculeaza
   * pe server. Pagina principala nu ii cere si ramane cu payload-ul de azi.
   * Indici, nu siruri: la 1221 de produse fiecare sir repetat se inmulteste cu
   * numarul de produse care il poarta.
   */
  f?: number[];
};
