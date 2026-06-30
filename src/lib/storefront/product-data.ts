import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { getPublicStoreConfig } from "@/lib/actions/store.actions";
import { readBundleConfig } from "@/lib/bundles";
import type { Database } from "@/types/database.types";

type Product = Database["public"]["Tables"]["products"]["Row"];

export interface BundleComponent {
  id: string;
  name: string;
  slug: string | null;
  price: number;
  image_url: string | null;
  quantity: number;
  out_of_stock: boolean;
}

/**
 * Fetch a single active product (full row) for a store, by id. Cached per request
 * so the One Product Store homepage's generateMetadata and render share one round
 * trip. Uses the RLS-aware client: visible to anonymous visitors only when the
 * product is active and the business is published, and to the owner for preview.
 */
export const getStoreProduct = cache(
  async (businessId: string, productId: string): Promise<Product | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("business_id", businessId)
      .eq("is_active", true)
      .single();
    return data;
  },
);

/**
 * Enrich a product row for the public ProductPage component, exactly as the
 * /[slug]/product/[productSlug] route does:
 *  - sanitize rich text (description + page_sections.short_description) IN PLACE;
 *  - map image URLs to Media Library alt text (SEO);
 *  - resolve whether card payment is available (drives the CTA label);
 *  - load bundle component products ("what's inside").
 *
 * Shared by the product route and the One Product Store homepage so both render
 * identical data. Mutates `product` in place (rich-text sanitization).
 */
export async function enrichStoreProduct(
  business: { id: string },
  product: Product,
): Promise<{
  altMap: Record<string, string>;
  hasCardPayment: boolean;
  bundleComponents: BundleComponent[];
}> {
  const supabase = await createClient();

  // SEO: map product image URLs to their Media Library alt text / title.
  // media_library is owner-only (no anon access), so read it via the service role.
  const imgUrls = ((product.images as string[] | null) ?? []).filter(Boolean);
  const altMap: Record<string, string> = {};
  if (imgUrls.length) {
    const { data: media } = await createAdminClient()
      .from("media_library")
      .select("url, alt_text, title")
      .eq("business_id", business.id)
      .in("url", imgUrls);
    for (const m of media ?? []) {
      const a = m.alt_text || m.title;
      if (a) altMap[m.url] = a;
    }
  }

  // Sanitize rich-text server-side so the client renders trusted HTML only.
  product.description = sanitizeHtml(product.description);
  const psRaw = product.page_sections as Record<string, unknown> | null;
  if (psRaw && typeof psRaw.short_description === "string") {
    psRaw.short_description = sanitizeHtml(psRaw.short_description);
  }

  // Card payment available? (same resolver as checkout — only counts a processor
  // that is actually configured/usable). Drives the CTA label.
  const publicConfig = await getPublicStoreConfig(business.id);
  const hasCardPayment = !!publicConfig?.payment_methods?.some((m) => m.type !== "cash_on_delivery");

  // For bundles, load the component products so the page can list "what's inside".
  const bundleCfg = product.is_bundle ? readBundleConfig(product.page_sections) : null;
  let bundleComponents: BundleComponent[] = [];
  if (bundleCfg) {
    const { data: comps } = await supabase
      .from("products")
      .select("id, name, slug, price, images, track_inventory, stock_quantity")
      .eq("business_id", business.id)
      .in("id", bundleCfg.items.map((i) => i.product_id));
    const cmap = new Map((comps ?? []).map((c) => [c.id, c]));
    bundleComponents = bundleCfg.items.map((it) => {
      const c = cmap.get(it.product_id);
      return {
        id: it.product_id,
        name: c?.name ?? "Produs",
        slug: c?.slug ?? null,
        price: Number(c?.price) || 0,
        image_url: c && Array.isArray(c.images) && c.images.length ? (c.images[0] as string) : null,
        quantity: it.quantity,
        out_of_stock: !!(c && c.track_inventory && (c.stock_quantity ?? 0) < it.quantity),
      };
    });
  }

  return { altMap, hasCardPayment, bundleComponents };
}
