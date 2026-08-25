import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { TrendyolClient } from "@/components/dashboard/TrendyolClient";
import { TrendyolReturns } from "@/components/dashboard/TrendyolReturns";
import { TrendyolAutoMap } from "@/components/dashboard/TrendyolAutoMap";
import { TrendyolCategoryMapping } from "@/components/dashboard/TrendyolCategoryMapping";
import { TrendyolListings } from "@/components/dashboard/TrendyolListings";
import { getTrendyolStatus } from "@/lib/actions/trendyol.actions";

export default async function TrendyolPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const status = await getTrendyolStatus(biz.id);
  const connected = !("error" in status) && status.connected;

  // Doar lista de categorii se incarca pe server; produsele vin paginat, la
  // cerere, fiindca un magazin cu mii de produse nu incape intr-o pagina.
  let categories: string[] = [];
  if (connected) {
    const catRows: { category: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("products").select("category").eq("business_id", biz.id).not("category", "is", null)
        .order("id").range(from, from + 999);
      catRows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    categories = [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ro"));
  }

  const st = "error" in status ? null : status;
  const nemapate = st ? categories.filter((c) => !st.categoryMap[c]).length : 0;

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="trendyol" description="Listează-ți produsele pe Trendyol și primești comenzile direct în Edinio." />
      <TrendyolClient businessId={biz.id} status={st} />
      {connected && st && (
        <div className="mt-6 space-y-6">
          {categories.length > 0 && (
            <TrendyolAutoMap businessId={biz.id} categories={categories} nemapate={nemapate} />
          )}
          <TrendyolCategoryMapping businessId={biz.id} edinioCategories={categories} mapped={st.categoryMap} />
          <TrendyolListings businessId={biz.id} categories={categories} storefront={st.storefront} />
          {/* ⚠ Retururile stau DUPA listari, dar pe aceeasi pagina: pana azi comerciantul afla
              de ele din panoul Trendyol si decidea acolo. */}
          <TrendyolReturns businessId={biz.id} />
        </div>
      )}
    </div>
  );
}
