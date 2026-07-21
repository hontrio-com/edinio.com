import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { buildCatalogItems, serializeCatalogFeed, type CatalogBusiness, type CatalogProduct } from "@/lib/facebook/catalog-feed";

export const dynamic = "force-dynamic";

// Meta (Facebook) Catalog product feed, per store, at {storeBaseUrl}/facebook-catalog.xml.
// One route serves both domain types: a custom domain reaches it because proxy.ts
// rewrites customdomain.ro/facebook-catalog.xml -> /{slug}/facebook-catalog.xml
// (it is NOT special-cased like /sitemap.xml); an edinio.com/{slug} store is served
// directly. The feed links use the store's canonical base (storeBaseUrl).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: biz } = await admin
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name, is_published")
    .eq("slug", slug)
    .maybeSingle();
  if (!biz || !biz.is_published) return new Response("Not found", { status: 404 });

  const business: CatalogBusiness = {
    slug: biz.slug,
    custom_domain: biz.custom_domain,
    store_name: biz.store_name,
    business_name: biz.business_name,
  };

  const products = await fetchAllRows("fbCatalog.products", (from, to) =>
    admin
      .from("products")
      .select("id, name, slug, description, price, compare_at_price, images, category, track_inventory, stock_quantity, page_sections")
      .eq("business_id", biz.id)
      .eq("is_active", true)
      .order("id")
      .range(from, to),
  );

  const items = products.flatMap((p) => buildCatalogItems(business, p as CatalogProduct));
  const xml = serializeCatalogFeed(business, items);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
