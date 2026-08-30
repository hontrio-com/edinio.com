import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { BundlesClient, type BundleListItem } from "@/components/dashboard/BundlesClient";
import { readBundleConfig, disponibilitatePachet } from "@/lib/bundles";
import { Skeleton, SkeletonRanduri } from "@/components/ui/skeleton";

/**
 * Cadrul pleaca imediat; lista de pachete curge dupa el.
 *
 * Citirea pachetelor cere DOUA drumuri la baza puse cap la cap — intai randurile
 * de pachet, apoi componentele lor, fiindca ID-urile componentelor se afla abia
 * din primul raspuns. Cat dureaza lantul, browserul nu primea nimic. Sub
 * `<Suspense>`, cadrul si scheletul pleaca dupa verificarea de proprietar, iar
 * lista se aseaza cand e gata.
 */
export default async function BundlesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-6">
      <Suspense fallback={<ScheletPachete />}>
        <ListaPachete
          businessId={biz.id}
          initialPage={Math.max(1, parseInt(pageParam ?? "1", 10) || 1)}
        />
      </Suspense>
    </div>
  );
}

function ScheletPachete() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-11 w-36 shrink-0" />
      </div>
      <Skeleton className="h-11" />
      <SkeletonRanduri randuri={5} inaltime="h-20" />
    </div>
  );
}

async function ListaPachete({ businessId, initialPage }: { businessId: string; initialPage: number }) {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("products")
    .select("id, name, images, price, compare_at_price, is_active, page_sections")
    .eq("business_id", businessId)
    .eq("is_bundle", true)
    .order("created_at", { ascending: false });

  const bundleRows = rows ?? [];
  const configs = new Map(bundleRows.map((b) => [b.id, readBundleConfig(b.page_sections)]));
  const compIds = new Set<string>();
  for (const cfg of configs.values()) cfg?.items.forEach((i) => compIds.add(i.product_id));

  const { data: comps } = compIds.size
    ? await supabase.from("products").select("id, is_active, price, track_inventory, stock_quantity").eq("business_id", businessId).in("id", [...compIds])
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

  return <BundlesClient businessId={businessId} bundles={bundles} initialPage={initialPage} />;
}
