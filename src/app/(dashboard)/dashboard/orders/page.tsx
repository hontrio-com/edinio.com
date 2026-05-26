import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrdersClient } from "@/components/dashboard/OrdersClient";
import type { SmartbillConfig } from "@/lib/smartbill";

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, business_name")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const [{ data: orders }, { count: pendingCount }, { data: settings }] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "pending"),
    supabase
      .from("store_settings")
      .select("smartbill_config")
      .eq("business_id", business.id)
      .single(),
  ]);

  const smartbillEnabled =
    (settings?.smartbill_config as SmartbillConfig | null)?.enabled === true;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <OrdersClient orders={orders ?? []} pendingCount={pendingCount ?? 0} smartbillEnabled={smartbillEnabled} businessId={business.id} />
    </div>
  );
}
