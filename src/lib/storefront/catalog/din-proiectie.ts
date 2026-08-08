import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StorefrontProduct } from "@/lib/storefront/product.types";

/**
 * Traduce un rand din `catalog_produs` in forma pe care o asteapta storefrontul.
 *
 * Pana acum catalogul se citea din `products`, cu `page_sections` intreg, si se
 * subtia in JS (`slimCatalogProduct`) dupa ce ajunsese deja in memoria functiei.
 * Pe eSAFE asta insemna 18 MB de JSON in patru dus-intorsuri, ca sa se randeze
 * 40 de carduri. Randul de proiectie are 336 de octeti si tot ce trebuie e deja
 * calculat.
 *
 * FORMA RAMANE IDENTICA, intentionat. Ar fi fost tentant sa scap odata cu asta de
 * campurile pe care lista nu le citeste (`weight_grams`, `is_active`), dar ele
 * apartin aceluiasi tip pe care il foloseste si PAGINA de produs, unde chiar se
 * citesc si unde fetch-ul e complet. Schimbarea tipului ar fi tarat dupa ea
 * zeci de consumatori pentru un castig masurat de ~0 octeti pe fir: `is_active`
 * e `true` de 3.351 de ori la rand, iar brotli il strange aproape complet.
 * Deci lista le trimite ca umplutura oneste, cu valorile pe care le-ar fi avut.
 */

/** Randul citit din `catalog_produs`. Exact coloanele cerute in `COLOANE_PROIECTIE`. */
export interface RandProiectie {
  product_id: string;
  name: string;
  slug: string | null;
  category: string | null;
  prima_imagine: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  is_featured: boolean;
  is_bundle: boolean;
  track_inventory: boolean;
  stock_quantity: number | null;
  sort_order: number;
  creat: string;
  fara_stoc: boolean;
  price_min: number | string;
  price_max: number | string;
  has_range: boolean;
  fara_oferta: boolean;
  optiuni: unknown;
  descriere_scurta: string;
  fatete: string[] | null;
}

/**
 * `business_id` se cere DOAR ca sa se poata filtra; nu ajunge in browser.
 * `cauta_norm` nu se cere deloc: cautarea din browser lucreaza pe campurile
 * afisate, iar coloana aia e pentru cautarea din SQL, care vine in faza urmatoare.
 */
export const COLOANE_PROIECTIE =
  "product_id, name, slug, category, prima_imagine, price, compare_at_price, is_featured, is_bundle, " +
  "track_inventory, stock_quantity, sort_order, creat, fara_stoc, price_min, price_max, has_range, " +
  "fara_oferta, optiuni, descriere_scurta, fatete";

/**
 * Client fara tipuri pentru `catalog_produs`, ca la `announcements`.
 *
 * Tabela nu e (inca) in tipurile generate, iar clientul tipat respinge orice
 * nume pe care nu-l stie. Tot service role trebuie sa fie oricum: tabela are RLS
 * pornit si NICIO politica, deci clientul vizitatorului n-ar da eroare, ar
 * raporta senin zero randuri — adica un magazin gol, tacut.
 */
export function proiectieDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

const nr = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v));

export function dinProiectie(r: RandProiectie): StorefrontProduct {
  return {
    id: r.product_id,
    name: r.name,
    slug: r.slug,
    // Descrierea din lista a fost DINTOTDEAUNA cea taiata la 300 de caractere
    // (vezi `descriereDeCautare`): singurul ei cititor e indexul de cautare din
    // browser. Acum vine gata taiata din proiectie, in loc sa se taie la fiecare
    // afisare de pagina.
    description: r.descriere_scurta,
    price: nr(r.price),
    compare_at_price: r.compare_at_price == null ? null : nr(r.compare_at_price),
    // Cardul foloseste doar prima imagine; asa facea si slimuirea.
    images: r.prima_imagine ? [r.prima_imagine] : [],
    category: r.category,
    is_featured: r.is_featured,
    is_bundle: r.is_bundle,
    track_inventory: r.track_inventory,
    stock_quantity: r.stock_quantity,
    sort_order: r.sort_order,
    created_at: r.creat,
    // Umplutura oneste, vezi nota de sus: lista nu le citeste, dar tipul le are
    // fiindca il imparte cu pagina de produs.
    is_active: true,
    business_id: "",
    weight_grams: null,
    page_sections: (r.optiuni ?? null) as StorefrontProduct["page_sections"],
    price_range: {
      min: nr(r.price_min),
      max: nr(r.price_max),
      hasRange: r.has_range,
      faraOferta: r.fara_oferta,
    },
    fara_stoc: r.fara_stoc,
  };
}
