import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getAbandonedCartsData } from "@/lib/actions/abandoned-cart.actions";
import { AbandonedCartsClient } from "@/components/dashboard/AbandonedCartsClient";

export default async function AbandonedCartsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();
  if (!biz) redirect("/dashboard");

  const data = await getAbandonedCartsData(biz.id);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AbandonedCartsClient businessId={biz.id} data={"error" in data ? null : data} />
    </div>
  );
}
