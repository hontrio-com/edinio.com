import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { BundlesClient, type BundleListItem } from "@/components/dashboard/BundlesClient";
import { readBundleConfig, disponibilitatePachet } from "@/lib/bundles";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function BundlesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const { page: pageParam } = await searchParams;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const { data: rows } = await supabase
    .from("products")
    .select("id, name, images, price, compare_at_price, is_active, page_sections")
    .eq("business_id", biz.id)
    .eq("is_bundle", true)
    .order("created_at", { ascending: false });

  const bundleRows = rows ?? [];
  const configs = new Map(bundleRows.map((b) => [b.id, readBundleConfig(b.page_sections)]));
  const compIds = new Set<string>();
  for (const cfg of configs.values()) cfg?.items.forEach((i) => compIds.add(i.product_id));

  const { data: comps } = compIds.size
    ? await supabase.from("products").select("id, is_active, price, track_inventory, stock_quantity").eq("business_id", biz.id).in("id", [...compIds])
    : { data: [] };
  const compMap = new Map((comps ?? []).map((c) => [c.id, c]));

  const bundles: BundleListItem[] = bundleRows.map((b) => {
    const cfg = configs.get(b.id);
    const components = (cfg?.items ?? []).map((i) => {
      const c = compMap.get(i.product_id);
      // Aici se citeste cu clientul PROPRIETARULUI, care vede si produsele
      // dezactivate — deci `is_active` se verifica explicit. Pe magazin, clientul
      // public nu le primeste deloc, si acolo simpla lipsa e de ajuns.
      return { quantity: i.quantity, track_inventory: c?.track_inventory ?? false, stock_quantity: c?.stock_quantity ?? 0, vandabila: !!c && c.is_active };
    });
    const price = Number(b.price) || 0;
    const compareAt = b.compare_at_price != null ? Number(b.compare_at_price) : null;
    return {
      id: b.id,
      name: b.name,
      image_url: Array.isArray(b.images) && b.images.length ? (b.images[0] as string) : null,
      price,
      compare_at_price: compareAt,
      is_active: b.is_active,
      component_count: cfg?.items.length ?? 0,
      savings: compareAt && compareAt > price ? Math.round((compareAt - price) * 100) / 100 : 0,
      in_stock: disponibilitatePachet(components).inStock,
    };
  });

  return (
    <div className="p-6">
      <BundlesClient businessId={biz.id} bundles={bundles} initialPage={Math.max(1, parseInt(pageParam ?? "1", 10) || 1)} />
    </div>
  );
}
