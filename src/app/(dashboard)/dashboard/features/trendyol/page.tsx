import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { TrendyolClient } from "@/components/dashboard/TrendyolClient";
import { TrendyolCategoryMapping } from "@/components/dashboard/TrendyolCategoryMapping";
import { TrendyolListings } from "@/components/dashboard/TrendyolListings";
import { getTrendyolStatus, getTrendyolListings } from "@/lib/actions/trendyol.actions";

export default async function TrendyolPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const status = await getTrendyolStatus(biz.id);
  const connected = !("error" in status) && status.connected;

  let categories: string[] = [];
  let products: { id: string; name: string; category: string | null; is_active: boolean }[] = [];
  let listings: Awaited<ReturnType<typeof getTrendyolListings>> = [];
  if (connected) {
    const catRows: { category: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("products").select("category").eq("business_id", biz.id).not("category", "is", null)
        .order("id").range(from, from + 999);
      catRows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    categories = [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort();

    const { data: prods } = await supabase
      .from("products").select("id, name, category, is_active")
      .eq("business_id", biz.id).eq("is_active", true)
      .order("updated_at", { ascending: false }).limit(300);
    products = prods ?? [];
    listings = await getTrendyolListings(biz.id);
  }

  const st = "error" in status ? null : status;

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="trendyol" description="Listează-ți produsele pe Trendyol și primești comenzile direct în Edinio." />
      <TrendyolClient businessId={biz.id} status={st} />
      {connected && st && (
        <div className="mt-6 space-y-6">
          <TrendyolCategoryMapping businessId={biz.id} edinioCategories={categories} mapped={st.categoryMap} />
          <TrendyolListings
            businessId={biz.id}
            products={products}
            listings={listings}
            cargoCompanyIdDefault={st.defaultCargoCompanyId ?? null}
          />
        </div>
      )}
    </div>
  );
}
