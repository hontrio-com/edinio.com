import { createAdminClient } from "@/lib/supabase/admin";
import { AdminBusinessesClient } from "@/components/admin/AdminBusinessesClient";

export const metadata = { title: "Magazine" };

export default async function AdminBusinessesPage() {
  const admin = createAdminClient();

  const [{ data: businesses }, { data: profiles }] = await Promise.all([
    admin.from("businesses").select("*").order("created_at", { ascending: false }),
    admin.from("users_profile").select("id, full_name, plan"),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Order counts per business
  const { data: orderCounts } = await admin.from("orders").select("business_id");
  const orderMap: Record<string, number> = {};
  for (const o of orderCounts ?? []) {
    orderMap[o.business_id] = (orderMap[o.business_id] ?? 0) + 1;
  }

  const enriched = (businesses ?? []).map((b) => ({
    ...b,
    owner: profileMap.get(b.user_id) ?? null,
    orders_count: orderMap[b.id] ?? 0,
  }));

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminBusinessesClient businesses={enriched} />
    </div>
  );
}
