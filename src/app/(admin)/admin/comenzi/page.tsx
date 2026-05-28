import { createAdminClient } from "@/lib/supabase/admin";
import { AdminOrdersClient } from "@/components/admin/AdminOrdersClient";

export const metadata = { title: "Comenzi" };

export default async function AdminOrdersPage() {
  const admin = createAdminClient();

  const [{ data: orders }, { data: businesses }] = await Promise.all([
    admin.from("orders").select("id, order_number, customer_name, customer_phone, customer_email, total, status, payment_method, created_at, business_id, shipping_address").order("created_at", { ascending: false }).limit(500),
    admin.from("businesses").select("id, business_name, store_name"),
  ]);

  const bizMap = new Map((businesses ?? []).map((b) => [b.id, b.store_name ?? b.business_name]));

  const enriched = (orders ?? []).map((o) => ({
    ...o,
    business_name: bizMap.get(o.business_id) ?? "—",
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <AdminOrdersClient orders={enriched} />
    </div>
  );
}
