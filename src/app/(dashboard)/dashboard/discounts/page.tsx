import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DiscountsClient } from "@/components/dashboard/DiscountsClient";

export default async function DiscountsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const { data: discounts } = await supabase
    .from("discounts")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <DiscountsClient discounts={discounts ?? []} businessId={business.id} />
    </div>
  );
}
