import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { AboutYouClient } from "@/components/dashboard/AboutYouClient";
import { AboutYouCategoryMapping } from "@/components/dashboard/AboutYouCategoryMapping";
import { AboutYouCarrierMapping } from "@/components/dashboard/AboutYouCarrierMapping";
import { AboutYouListings } from "@/components/dashboard/AboutYouListings";
import { getAboutYouStatus, getAboutYouListings } from "@/lib/actions/aboutyou.actions";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Antetul integrarii pleaca imediat; starea conexiunii curge dupa el.
 *
 * `getAboutYouStatus` inseamna un drum pana la SCAYLE, iar cand magazinul e legat
 * mai vin dupa el categoriile (citite din 1000 in 1000), produsele si listarile —
 * tot lanturi puse cap la cap. Antetul (link de intoarcere, sigla, descriere) nu
 * depinde de nimic din toate astea, deci nu are de ce sa le astepte.
 */
export default async function AboutYouPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="aboutyou" description="Listează-ți produsele pe About You Marketplace și primești comenzile direct în Edinio." />
      <Suspense fallback={<ScheletAboutYou />}>
        <ContinutAboutYou businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function ScheletAboutYou() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

async function ContinutAboutYou({ businessId }: { businessId: string }) {
  const supabase = await createClient();

  const status = await getAboutYouStatus(businessId);
  const connected = !("error" in status) && status.connected;

  let categories: string[] = [];
  let products: { id: string; name: string; category: string | null; is_active: boolean }[] = [];
  let listings: Awaited<ReturnType<typeof getAboutYouListings>> = [];
  if (connected) {
    // Distinct product categories, windowed past the 1000-row PostgREST cap.
    const catRows: { category: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("products").select("category").eq("business_id", businessId).not("category", "is", null)
        .order("id").range(from, from + 999);
      catRows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    categories = [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort();

    const { data: prods } = await supabase
      .from("products").select("id, name, category, is_active")
      .eq("business_id", businessId).eq("is_active", true)
      .order("updated_at", { ascending: false }).limit(300);
    products = prods ?? [];
    listings = await getAboutYouListings(businessId);
  }

  const st = "error" in status ? null : status;

  return (
    <>
      <AboutYouClient businessId={businessId} status={st} />
      {connected && st && (
        <div className="mt-6 space-y-6">
          <AboutYouCategoryMapping businessId={businessId} edinioCategories={categories} mapped={st.categoryMap} />
          <AboutYouCarrierMapping businessId={businessId} carrierMap={st.carrierMap} />
          <AboutYouListings
            businessId={businessId}
            products={products}
            listings={listings}
            pricing={{ mode: st.priceMode, rate: st.fxRate, marginPct: st.fxMarginPct }}
          />
        </div>
      )}
    </>
  );
}
