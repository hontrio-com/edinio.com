import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { DiscountsClient } from "@/components/dashboard/DiscountsClient";

export default async function DiscountsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("businesses")
    .select("id, discounts(*)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!row) redirect("/dashboard");

  const discounts = Array.isArray(row.discounts) ? row.discounts : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <DiscountsClient discounts={discounts} businessId={row.id} />
    </div>
  );
}
