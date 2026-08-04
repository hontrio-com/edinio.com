import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ProductsClient } from "@/components/dashboard/ProductsClient";
import { getProductLimit } from "@/lib/plan-limits";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Cadrul pleaca imediat; catalogul curge dupa el.
 *
 * `fetchAllRows` cere baza in ferestre de cate 1000 de randuri, deci la un
 * catalog mare pagina statea in mai multe dus-intors inainte sa trimita ceva
 * spre browser, iar `loading.tsx` tinea tot ecranul gri pana la ultima fereastra.
 * Identitatea magazinului, planul si limita de produse se stiu insa dupa PRIMA
 * interogare, deci sub `<Suspense>` intra doar lista.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: bizRow }, { search: searchQuery, page: pageParam }, { data: profile }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, store_settings(olx_config)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    searchParams,
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
  ]);

  if (!bizRow) redirect("/dashboard");

  const plan = profile?.plan ?? "free";
  const productLimit = getProductLimit(plan);

  const olxSettings = Array.isArray(bizRow.store_settings) ? bizRow.store_settings[0] : bizRow.store_settings;
  const olxConnected = !!(olxSettings?.olx_config as { connected?: boolean } | null)?.connected;

  return (
    <div className="p-4 sm:p-6">
      <Suspense fallback={<ScheletProduse />}>
        <ListaProduse
          businessId={bizRow.id}
          initialSearch={searchQuery ?? ""}
          initialPage={Math.max(1, parseInt(pageParam ?? "1", 10) || 1)}
          productLimit={productLimit}
          plan={plan}
          olxConnected={olxConnected}
        />
      </Suspense>
    </div>
  );
}

function ScheletProduse() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>
      {/*
        * Doua forme, fiindca `ProductsClient` randeaza doua lucruri diferite:
        * carduri pe telefon (`sm:hidden`) si TABEL pe desktop (`hidden sm:block`).
        * Un singur schelet de carduri ar fi parut corect pe telefon si ar fi sarit
        * pe desktop — greseala era mostenita din vechiul `loading.tsx`.
        */}
      <div className="grid grid-cols-1 gap-4 sm:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
      <Skeleton className="hidden sm:block h-[520px] rounded-xl" />
    </div>
  );
}

async function ListaProduse({
  businessId,
  initialSearch,
  initialPage,
  productLimit,
  plan,
  olxConnected,
}: {
  businessId: string;
  initialSearch: string;
  initialPage: number;
  productLimit: number;
  plan: string;
  olxConnected: boolean;
}) {
  const supabase = await createClient();

  // Windowed reads: embedded selects (businesses -> products(...)) cap silently
  // at 1000 rows (PostgREST), so a bigger catalog looked truncated to exactly
  // 1000 in the list and the merchant read it as a plan limit.
  const [productsRaw, categoriesRaw] = await Promise.all([
    fetchAllRows("dashboard.products.list", (from, to) =>
      supabase
        .from("products")
        .select("id, name, slug, sku, price, compare_at_price, images, category, is_active, is_featured, is_bundle, track_inventory, stock_quantity, sort_order, created_at, business_id")
        .eq("business_id", businessId)
        .order("id")
        .range(from, to)
    ),
    fetchAllRows("dashboard.products.categories", (from, to) =>
      supabase
        .from("categories")
        .select("id, name, parent_id, sort_order")
        .eq("business_id", businessId)
        .order("sort_order")
        .order("id")
        .range(from, to)
    ),
  ]);

  const products = productsRaw
    .filter((p) => !p.is_bundle)
    .sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const categories = [...categoriesRaw]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

  return (
    <ProductsClient
      products={products}
      businessId={businessId}
      initialSearch={initialSearch}
      initialPage={initialPage}
      categories={categories}
      productLimit={productLimit}
      productCount={products.length}
      plan={plan}
      olxConnected={olxConnected}
    />
  );
}
