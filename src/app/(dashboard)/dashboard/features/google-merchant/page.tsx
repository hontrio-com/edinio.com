import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { GoogleMerchantClient } from "@/components/dashboard/GoogleMerchantClient";
import { getMerchantStatus, getMerchantProducts } from "@/lib/actions/google-merchant.actions";
import { GOOGLE_MERCHANT_LIVE } from "@/lib/google-merchant/types";

export default async function GoogleMerchantPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  // Live for everyone (OAuth verified 2026-07-21); GOOGLE_MERCHANT_LIVE is now a kill-switch.
  const { data: profile } = await supabase.from("users_profile").select("role").eq("id", user.id).single();
  const available = GOOGLE_MERCHANT_LIVE || profile?.role === "admin";

  const status = await getMerchantStatus(biz.id);
  const products = "error" in status ? [] : await getMerchantProducts(biz.id);

  // Windowed peste cap-ul de 1000 PostgREST — altfel lipsesc categorii din maparea GMC.
  const catRows: { category: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("products").select("category").eq("business_id", biz.id).not("category", "is", null)
      .order("id").range(from, from + 999);
    catRows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const categories = [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort();

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="google-merchant" description="Sincronizează produsele în Google Merchant Center (Shopping + Google Ads)." />
      <GoogleMerchantClient businessId={biz.id} status={"error" in status ? null : status} products={products} categories={categories} available={available} />
    </div>
  );
}
