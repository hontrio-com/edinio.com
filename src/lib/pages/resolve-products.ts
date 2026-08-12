import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { Block, ProductsBlock } from "@/lib/pages/blocks.types";
import { flattenBlocks } from "@/lib/pages/block-tree";
import type { PageProduct } from "@/components/pages/blocks/ProductsBlock";
import { getProductPriceRange } from "@/lib/utils/product-price";
import { numeCategoriiAscunse } from "@/lib/categories/vizibilitate";

type DB = SupabaseClient<Database>;

const COLS = "id, name, slug, price, compare_at_price, images, category, is_featured, page_sections, is_bundle, track_inventory, stock_quantity";
const MAX = 24;

/**
 * Setarea de vizibilitate a catalogului (editor > Pagina magazin): ascunde
 * produsele fara imagini si/sau fara stoc din listele publice. Pachetele
 * (is_bundle) nu sunt evaluate la stoc aici — componentele lor nu sunt
 * incarcate in acest context, deci raman vizibile (conservator); storefront-ul
 * principal le trateaza complet, cu stoc derivat din componente.
 */
export interface ProductVisibility {
  hideNoImage?: boolean;
  hideOutOfStock?: boolean;
  /**
   * Numele de categorie stinse din panou. Se calculeaza o data per pagina, in
   * `resolveAllProductsBlocks` — un bloc de produse de pe o pagina proprie e tot
   * o vitrina a magazinului, deci un raion stins n-are ce cauta in el, indiferent
   * daca blocul alege pe categorie, pe „recomandate" sau produs cu produs.
   */
  numeCategoriiStinse?: ReadonlySet<string>;
}

function isVisible(p: { images: unknown; category: unknown; is_bundle: boolean | null; track_inventory: boolean | null; stock_quantity: number | null }, v: ProductVisibility): boolean {
  if (v.numeCategoriiStinse?.size && typeof p.category === "string" && v.numeCategoriiStinse.has(p.category)) return false;
  if (v.hideNoImage) {
    const imgs = Array.isArray(p.images) ? (p.images as unknown[]).filter(Boolean) : [];
    if (imgs.length === 0) return false;
  }
  // Aceeasi semantica precisa ca badge-ul „Stoc epuizat" din storefront.
  if (v.hideOutOfStock && !p.is_bundle && p.track_inventory && p.stock_quantity === 0) return false;
  return true;
}

function toPageProduct(p: Record<string, unknown>): PageProduct {
  return {
    id: p.id as string,
    name: p.name as string,
    slug: (p.slug as string | null) ?? null,
    price: Number(p.price),
    compare_at_price: p.compare_at_price != null ? Number(p.compare_at_price) : null,
    images: Array.isArray(p.images) ? (p.images as unknown[]).map(String).filter(Boolean) : [],
    category: (p.category as string | null) ?? null,
    is_featured: !!p.is_featured,
    page_sections: p.page_sections ?? null,
    price_range: getProductPriceRange(Number(p.price), p.page_sections ?? null),
  };
}

/**
 * Resolve the products a single products-block should show, with a hard cap so a
 * store with thousands/tens-of-thousands of products never loads them all.
 */
export async function resolveBlockProducts(supabase: DB, businessId: string, block: ProductsBlock, visibility: ProductVisibility = {}): Promise<PageProduct[]> {
  const limit = Math.min(Math.max(block.limit ?? 8, 1), MAX);

  let q = supabase.from("products").select(COLS).eq("business_id", businessId).eq("is_active", true);
  if (block.mode === "featured") q = q.eq("is_featured", true);
  else if (block.mode === "category" && block.category) q = q.eq("category", block.category);
  else if (block.mode === "selected") {
    const ids = (block.productIds ?? []).slice(0, MAX);
    if (ids.length === 0) return [];
    q = q.in("id", ids);
  }

  const { data } = await q.order("is_featured", { ascending: false }).order("sort_order").limit(MAX);
  let list = (data ?? []).filter((p) => isVisible(p, visibility)).map(toPageProduct);

  if (block.mode === "selected" && block.productIds) {
    const order = new Map(block.productIds.map((id, i) => [id, i]));
    list = list.slice().sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }
  return list.slice(0, limit);
}

/** Resolve products for every products-block on a page (one bounded query each). */
export async function resolveAllProductsBlocks(supabase: DB, businessId: string, blocks: Block[], visibility: ProductVisibility = {}): Promise<Record<string, PageProduct[]>> {
  const map: Record<string, PageProduct[]> = {};
  // flatten so products blocks nested inside columns are resolved too.
  const productBlocks = flattenBlocks(blocks).filter((b): b is ProductsBlock => b.type === "products");
  if (productBlocks.length === 0) return map;

  /*
   * Categoriile stinse, citite O DATA pentru toata pagina si numai cand chiar
   * exista blocuri de produse: o pagina „Despre noi" n-are de ce sa plateasca o
   * interogare in plus. Tabelul e mic (zeci de randuri), iar subarborele nu se
   * poate cere din SQL cu un `.eq("is_active", true)` — o categorie aprinsa sub
   * un parinte stins e tot ascunsa.
   */
  const { data: categorii } = await supabase
    .from("categories")
    .select("id, name, parent_id, is_active")
    .eq("business_id", businessId)
    .limit(1000);
  const vizibilitate: ProductVisibility = {
    ...visibility,
    numeCategoriiStinse: numeCategoriiAscunse(categorii ?? []),
  };

  await Promise.all(productBlocks.map(async (b) => { map[b.id] = await resolveBlockProducts(supabase, businessId, b, vizibilitate); }));
  return map;
}
