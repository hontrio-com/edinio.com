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
 * `price_range` vine INTOTDEAUNA de la server: payload-ul slim arunca
 * `combinations`, deci in browser nu se mai poate deriva. Detalii in
 * lib/storefront/catalog-slim.ts.
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
  /**
   * Intervalul de pret, calculat pe SERVER inainte de slimuire.
   *
   * Obligatoriu, nu optional: payload-ul slim arunca `combinations`
   * (`catalog-slim.ts`), deci in browser nu se mai poate calcula — o rezerva
   * locala ar raspunde „niciun pret de vanzare" pentru fiecare produs cu
   * variante. Camp cerut inseamna ca `tsc` enumera producatorii.
   */
  price_range: PriceRange;
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
