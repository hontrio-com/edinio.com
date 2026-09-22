import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { TrendyolClient } from "@/components/dashboard/TrendyolClient";
import { TrendyolReturns } from "@/components/dashboard/TrendyolReturns";
import { TrendyolAutoMap } from "@/components/dashboard/TrendyolAutoMap";
import { TrendyolCategoryMapping } from "@/components/dashboard/TrendyolCategoryMapping";
import { TrendyolListings } from "@/components/dashboard/TrendyolListings";
import { getTrendyolStatus } from "@/lib/actions/trendyol.actions";

/**
 * Trendyol Marketplace.
 *
 * ⚠ PE TOT ECRANUL, ca la eMAG, si din acelasi motiv. Cerut de el pe 22.09.2026.
 *
 * Pagina asta nu e un formular de curier cu trei campuri. Are sapte panouri
 * (cont, cifre, setari, comenzi, mapare automata, maparea categoriilor, lista
 * de listari si retururile), iar lista de listari are opt coloane. Stransa la
 * `max-w-3xl`, se ingusta pe stanga cu jumatate de ecran gol la dreapta, iar
 * randurile tabelului se rupeau pe doua linii.
 *
 * ⚠ ANTETUL PLEACA INAINTEA STARII, tot ca la eMAG. `getTrendyolStatus` face
 * sapte numaratori in baza, iar citirea categoriilor trece prin TOT catalogul,
 * o mie de randuri o data: la un magazin mare, cu antetul inauntru, primul
 * lucru pe care il vedea comerciantul era un ecran gol.
 */
export default async function TrendyolPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-6">
      <IntegrationHeader id="trendyol" description="Listează-ți produsele pe Trendyol și primești comenzile direct în Edinio." />
      <Suspense fallback={<ScheletTrendyol />}>
        <ContinutTrendyol businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function ScheletTrendyol() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-xl sm:h-[168px]" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ContinutTrendyol({ businessId }: { businessId: string }) {
  const supabase = await createClient();
  const status = await getTrendyolStatus(businessId);
  const connected = !("error" in status) && status.connected;

  // Doar lista de categorii se incarca pe server; produsele vin paginat, la
  // cerere, fiindca un magazin cu mii de produse nu incape intr-o pagina.
  let categories: string[] = [];
  if (connected) {
    const catRows: { category: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("products").select("category").eq("business_id", businessId).not("category", "is", null)
        .order("id").range(from, from + 999);
      catRows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    categories = [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ro"));
  }

  const st = "error" in status ? null : status;
  const nemapate = st ? categories.filter((c) => !st.categoryMap[c]).length : 0;

  return (
    <div className="space-y-4">
      <TrendyolClient businessId={businessId} status={st} />
      {connected && st && (
        <>
          {categories.length > 0 && (
            <TrendyolAutoMap businessId={businessId} categories={categories} nemapate={nemapate} />
          )}
          <TrendyolCategoryMapping businessId={businessId} edinioCategories={categories} mapped={st.categoryMap} />
          <TrendyolListings businessId={businessId} categories={categories} storefront={st.storefront} />
          {/* ⚠ Retururile stau DUPA listari, dar pe aceeasi pagina: pana azi comerciantul afla
              de ele din panoul Trendyol si decidea acolo. */}
          <TrendyolReturns businessId={businessId} />
        </>
      )}
    </div>
  );
}
