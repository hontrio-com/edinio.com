import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getProductLimit } from "@/lib/plan-limits";
import { ImportWizard } from "@/components/dashboard/import/ImportWizard";

export default async function ImportProductsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  const [{ count }, { data: profile }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id),
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
  ]);

  const plan = profile?.plan ?? "free";

  return (
    <div className="p-6">
      <ImportWizard plan={plan} productLimit={getProductLimit(plan)} productCount={count ?? 0} />
    </div>
  );
}
