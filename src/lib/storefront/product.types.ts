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
   * Produsul e epuizat — raspuns venit de la SERVER, pentru pachete cu tot.
   *
   * Intrebarea „e in stoc?" a avut opt formulari in aplicatie, si niciuna dintre
   * cele din browser nu stia de pachete: un pachet se scrie cu
   * `track_inventory: false`, deci `!track_inventory || stock > 0` era adevarat
   * pentru fiecare, oricum ar fi stat componentele lui. Asa a stat „Pachet Femei"
   * o saptamana pe raft, la 358,40 lei, cu toate cele trei componente sterse.
   *
   * Pana acum raspunsul corect se putea deriva in browser doar fiindca payload-ul
   * continea TOT catalogul activ, deci o componenta lipsa insemna „stearsa". In
   * clipa in care lista devine partiala, derivarea aia nu mai e posibila — si ar
   * marca fiecare pachet ca indisponibil. De aia verdictul vine gata luat din
   * `catalog_produs.fara_stoc`, calculat de `catalog_fara_stoc` in baza.
   *
   * Camp CERUT, nu optional: un steag optional se uita exact acolo unde conteaza.
   */
  fara_stoc: boolean;
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
