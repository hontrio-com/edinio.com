import { createAdminClient } from "@/lib/supabase/admin";
import { AdminDomainOrdersClient } from "@/components/admin/AdminDomainOrdersClient";

export const metadata = { title: "Comenzi domenii" };

export default async function AdminDomainOrdersPage() {
  const admin = createAdminClient();

  const [{ data: orders }, { data: businesses }] = await Promise.all([
    admin
      .from("domain_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("businesses").select("id, business_name, store_name"),
  ]);

  const bizMap = new Map(
    (businesses ?? []).map((b) => [b.id, b.store_name ?? b.business_name])
  );

  const enriched = (orders ?? []).map((o) => ({
    ...o,
    contact_info: (o.contact_info ?? {}) as Record<string, string>,
    business_name: bizMap.get(o.business_id) ?? "—",
  }));

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminDomainOrdersClient orders={enriched} />
    </div>
  );
}
