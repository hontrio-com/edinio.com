import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getBundleEligibleProducts } from "@/lib/actions/bundle.actions";
import { BundleForm } from "@/components/dashboard/BundleForm";

export default async function NewBundlePage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id, categories(id, name)").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const eligible = await getBundleEligibleProducts(biz.id);
  const categories = Array.isArray(biz.categories) ? biz.categories.map((c) => ({ id: c.id, name: c.name })) : [];

  return (
    <div className="p-6">
      <BundleForm businessId={biz.id} eligibleProducts={eligible} categories={categories} />
    </div>
  );
}
