import { disponibilitatePachet, readBundleConfig } from "@/lib/bundles";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { buildCatalogItems, serializeCatalogFeed, type CatalogBusiness, type CatalogProduct } from "@/lib/facebook/catalog-feed";

import { connection } from "next/server";

// Meta (Facebook) Catalog product feed, per store, at {storeBaseUrl}/facebook-catalog.xml.
// One route serves both domain types: a custom domain reaches it because proxy.ts
// rewrites customdomain.ro/facebook-catalog.xml -> /{slug}/facebook-catalog.xml
// (it is NOT special-cased like /sitemap.xml); an edinio.com/{slug} store is served
// directly. The feed links use the store's canonical base (storeBaseUrl).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  // Ruta citeste date la fiecare cerere — ca pana acum. `connection()` spune
  // asta explicit, ca prerandarea sa nu o execute in timpul build-ului.
  await connection();
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
      .select("id, name, slug, description, price, compare_at_price, images, category, is_bundle, track_inventory, stock_quantity, page_sections")
      .eq("business_id", biz.id)
      .eq("is_active", true)
      .order("id")
      .range(from, to),
  );

  /*
   * Disponibilitatea pachetelor, din componentele lor.
   *
   * Feedul e o ruta publica permanenta, deci pana acum toate pachetele
   * magazinului plecau spre Meta ca „in stock" — si dupa ce pagina lor a inceput
   * sa spuna „Stoc epuizat", divergenta asta e chiar tiparul din care ies
   * suspendarile de catalog. Componentele sunt tot in lista incarcata mai sus:
   * nicio interogare in plus.
   */
  const dupaId = new Map(products.map((p) => [p.id, p]));
  const items = products.flatMap((p) => {
    const pachetDisponibil = p.is_bundle
      ? disponibilitatePachet((readBundleConfig(p.page_sections)?.items ?? []).map((it) => {
          const c = dupaId.get(it.product_id);
          return {
            quantity: it.quantity,
            vandabila: !!c,
            track_inventory: !!c?.track_inventory,
            stock_quantity: c?.stock_quantity ?? null,
          };
        })).inStock
      : undefined;
    return buildCatalogItems(business, { ...p, pachetDisponibil } as CatalogProduct);
  });
  const xml = serializeCatalogFeed(business, items);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
