import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { BundlesClient, type BundleListItem } from "@/components/dashboard/BundlesClient";
import { readBundleConfig, bundleAvailability } from "@/lib/bundles";

export default async function BundlesPage() {
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
    ? await supabase.from("products").select("id, track_inventory, stock_quantity").eq("business_id", biz.id).in("id", [...compIds])
    : { data: [] };
  const compMap = new Map((comps ?? []).map((c) => [c.id, c]));

  const bundles: BundleListItem[] = bundleRows.map((b) => {
    const cfg = configs.get(b.id);
    const components = (cfg?.items ?? []).map((i) => {
      const c = compMap.get(i.product_id);
      return { quantity: i.quantity, track_inventory: c?.track_inventory ?? false, stock_quantity: c?.stock_quantity ?? 0, missing: !c };
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
      in_stock: bundleAvailability(components).inStock,
    };
  });

  return (
    <div className="p-6">
      <BundlesClient businessId={biz.id} bundles={bundles} />
    </div>
  );
}
