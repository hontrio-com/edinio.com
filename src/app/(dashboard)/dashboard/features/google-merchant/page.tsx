import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { GoogleMerchantClient } from "@/components/dashboard/GoogleMerchantClient";
import { getMerchantStatus, getMerchantProducts } from "@/lib/actions/google-merchant.actions";

export default async function GoogleMerchantPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const status = await getMerchantStatus(biz.id);
  const products = "error" in status ? [] : await getMerchantProducts(biz.id);

  const { data: catRows } = await supabase
    .from("products").select("category").eq("business_id", biz.id).not("category", "is", null);
  const categories = [...new Set((catRows ?? []).map((r) => r.category as string).filter(Boolean))].sort();

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="google-merchant" description="Sincronizează produsele în Google Merchant Center (Shopping + Google Ads)." />
      <GoogleMerchantClient businessId={biz.id} status={"error" in status ? null : status} products={products} categories={categories} />
    </div>
  );
}
