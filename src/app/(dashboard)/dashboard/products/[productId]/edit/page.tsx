import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ProductForm } from "@/components/dashboard/ProductForm";
import { parseShippingClasses } from "@/lib/shipping/rules";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

interface Props {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function EditProductPage({ params, searchParams }: Props) {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const { productId } = await params;
  const { page } = await searchParams;
  // Preserve the products-list page the merchant came from, so saving returns there.
  const backHref = page && Number(page) > 1 ? `/dashboard/products?page=${encodeURIComponent(page)}` : "/dashboard/products";
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, is_published, store_settings(olx_config, trendyol_config, google_merchant_config, shipping_classes)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  const settings = Array.isArray(business.store_settings) ? business.store_settings[0] : business.store_settings;
  const olxConnected = !!(settings?.olx_config as { connected?: boolean } | null)?.connected;
  const trendyolConnected = !!(settings?.trendyol_config as { connected?: boolean } | null)?.connected;
  const gmcConfig = settings?.google_merchant_config as { connected?: boolean; account_id?: string } | null;
  const gmcConnected = !!gmcConfig?.connected && !!gmcConfig?.account_id;
  const shippingClasses = parseShippingClasses(settings?.shipping_classes);

  // Categories windowed past the 1000-row PostgREST cap (big imported taxonomies).
  const [{ data: product }, categories] = await Promise.all([
    // `is_bundle: false`: formularul obisnuit reconstruieste `page_sections` de la
    // zero si nu cunoaste cheia `bundle`, iar `updateProduct` scrie inlocuire. O
    // SINGURA salvare lasa `is_bundle = true` cu configul sters — pachetul
    // continua sa se vanda la pretul lui inghetat, iar `expandBundleStock` cade pe
    // ramura de produs simplu si scade stocul RANDULUI DE PACHET in loc de
    // componente. Pachetele isi au formularul lor, la /dashboard/products/bundles.
    supabase.from("products").select("*").eq("id", productId).eq("business_id", business.id).eq("is_bundle", false).single(),
    fetchAllRows("dashboard.product-edit.categories", (from, to) =>
      supabase.from("categories").select("id, name, parent_id").eq("business_id", business.id)
        .order("sort_order").order("name").order("id").range(from, to)
    ),
  ]);

  if (!product) notFound();

  return (
    <ProductForm
      businessId={business.id}
      product={product}
      categories={categories}
      backHref={backHref}
      business={business.slug ? { slug: business.slug, is_published: !!business.is_published } : undefined}
      olxConnected={olxConnected}
      trendyolConnected={trendyolConnected}
      gmcConnected={gmcConnected}
      shippingClasses={shippingClasses}
    />
  );
}
