import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { AboutYouClient } from "@/components/dashboard/AboutYouClient";
import { AboutYouCategoryMapping } from "@/components/dashboard/AboutYouCategoryMapping";
import { AboutYouCarrierMapping } from "@/components/dashboard/AboutYouCarrierMapping";
import { AboutYouListings } from "@/components/dashboard/AboutYouListings";
import { getAboutYouStatus, getAboutYouListings } from "@/lib/actions/aboutyou.actions";

export default async function AboutYouPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const status = await getAboutYouStatus(biz.id);
  const connected = !("error" in status) && status.connected;

  let categories: string[] = [];
  let products: { id: string; name: string; category: string | null; is_active: boolean }[] = [];
  let listings: Awaited<ReturnType<typeof getAboutYouListings>> = [];
  if (connected) {
    // Distinct product categories, windowed past the 1000-row PostgREST cap.
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
    listings = await getAboutYouListings(biz.id);
  }

  const st = "error" in status ? null : status;

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="aboutyou" description="Listează-ți produsele pe About You Marketplace și primești comenzile direct în Edinio." />
      <AboutYouClient businessId={biz.id} status={st} />
      {connected && st && (
        <div className="mt-6 space-y-6">
          <AboutYouCategoryMapping businessId={biz.id} edinioCategories={categories} mapped={st.categoryMap} />
          <AboutYouCarrierMapping businessId={biz.id} carrierMap={st.carrierMap} />
          <AboutYouListings
            businessId={biz.id}
            products={products}
            listings={listings}
            pricing={{ mode: st.priceMode, rate: st.fxRate, marginPct: st.fxMarginPct }}
          />
        </div>
      )}
    </div>
  );
}
