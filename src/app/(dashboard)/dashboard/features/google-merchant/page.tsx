import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { GoogleMerchantClient } from "@/components/dashboard/GoogleMerchantClient";
import { getMerchantStatus, getMerchantProducts } from "@/lib/actions/google-merchant.actions";
import { GOOGLE_MERCHANT_LIVE } from "@/lib/google-merchant/types";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Antetul integrarii pleaca imediat; starea contului Merchant curge dupa el.
 *
 * `getMerchantStatus` si `getMerchantProducts` sunt drumuri pana la Google, puse
 * cap la cap, iar dupa ele mai vine si citirea categoriilor din 1000 in 1000.
 * Antetul (link de intoarcere, sigla, descriere) nu depinde de niciuna.
 */
export default async function GoogleMerchantPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="google-merchant" description="Sincronizează produsele în Google Merchant Center (Shopping + Google Ads)." />
      <Suspense fallback={<ScheletMerchant />}>
        <ContinutMerchant businessId={biz.id} userId={user.id} />
      </Suspense>
    </div>
  );
}

function ScheletMerchant() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

async function ContinutMerchant({ businessId, userId }: { businessId: string; userId: string }) {
  const supabase = await createClient();

  // Live for everyone (OAuth verified 2026-07-21); GOOGLE_MERCHANT_LIVE is now a kill-switch.
  const { data: profile } = await supabase.from("users_profile").select("role").eq("id", userId).single();
  const available = GOOGLE_MERCHANT_LIVE || profile?.role === "admin";

  const status = await getMerchantStatus(businessId);
  const products = "error" in status ? [] : await getMerchantProducts(businessId);

  // Windowed peste cap-ul de 1000 PostgREST — altfel lipsesc categorii din maparea GMC.
  const catRows: { category: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("products").select("category").eq("business_id", businessId).not("category", "is", null)
      .order("id").range(from, from + 999);
    catRows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const categories = [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort();

  return (
    <GoogleMerchantClient businessId={businessId} status={"error" in status ? null : status} products={products} categories={categories} available={available} />
  );
}
