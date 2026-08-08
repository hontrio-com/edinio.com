import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { aplicaFiltreProduse, citesteFiltreProduse, ordoneazaProduse, PRODUSE_PE_PAGINA, type FiltreProduse } from "@/lib/dashboard/produse-filtre";
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
  searchParams: Promise<{ search?: string; page?: string; cat?: string; stare?: string; stoc?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: bizRow }, sp, { data: profile }] = await Promise.all([
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

  const filtre = citesteFiltreProduse(sp);

  return (
    <div className="p-4 sm:p-6">
      {/* `key` pe filtre: la o filtrare noua lista se remonteaza, deci starea de
          selectie si pagina pornesc curate — altfel ar fi ramas bifate produse
          care nu mai sunt in lista. */}
      <Suspense key={JSON.stringify(filtre)} fallback={<ScheletProduse />}>
        <ListaProduse
          businessId={bizRow.id}
          filtre={filtre}
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
  filtre,
  productLimit,
  plan,
  olxConnected,
}: {
  businessId: string;
  filtre: FiltreProduse;
  productLimit: number;
  plan: string;
  olxConnected: boolean;
}) {
  const supabase = await createClient();

  /*
   * O PAGINA de produse, filtrata in SQL — nu tot catalogul, filtrat in browser.
   *
   * Se citea TOT: la eSAFE, 4,9 MB de randuri (3.351 de produse) ca sa se arate
   * douazeci si cinci. `?search=` si `?page=` existau in adresa si erau
   * decorative — filtrarea si felierea se faceau amandoua in `ProductsClient`.
   *
   * Categoriile raman citite intregi: sunt cateva zeci, alimenteaza selectorul de
   * filtru si trebuie sa fie toate acolo, nu doar cele de pe pagina curenta.
   * `numaraProdusele` e separat de `count`-ul listei: limita de plan se masoara pe
   * catalogul INTREG, nu pe cate randuri a lasat filtrul.
   */
  const de_la = (filtre.pagina - 1) * PRODUSE_PE_PAGINA;

  const categoriesRaw = await fetchAllRows("dashboard.products.categories", (from, to) =>
    supabase
      .from("categories")
      .select("id, name, parent_id, sort_order")
      .eq("business_id", businessId)
      .order("sort_order")
      .order("id")
      .range(from, to)
  );

  const [{ data: productsRaw, count: totalFiltrate }, { count: totalCatalog }] = await Promise.all([
    ordoneazaProduse(
      aplicaFiltreProduse(
        supabase
          .from("products")
          .select(
            "id, name, slug, sku, price, compare_at_price, images, category, is_active, is_featured, is_bundle, track_inventory, stock_quantity, sort_order, created_at, business_id",
            { count: "exact" },
          )
          .eq("business_id", businessId),
        filtre,
        categoriesRaw,
      ),
    ).range(de_la, de_la + PRODUSE_PE_PAGINA - 1),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("is_bundle", false),
  ]);

  const products = productsRaw ?? [];

  const categories = [...categoriesRaw]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

  return (
    <ProductsClient
      products={products}
      businessId={businessId}
      filtre={filtre}
      totalFiltrate={totalFiltrate ?? 0}
      categories={categories}
      productLimit={productLimit}
      productCount={totalCatalog ?? 0}
      plan={plan}
      olxConnected={olxConnected}
    />
  );
}
