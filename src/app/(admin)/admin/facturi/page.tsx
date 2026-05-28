import { createAdminClient } from "@/lib/supabase/admin";
import { AdminInvoicesClient } from "@/components/admin/AdminInvoicesClient";

export const metadata = { title: "Facturi" };

export default async function AdminInvoicesPage() {
  const admin = createAdminClient();

  const [{ data: invoices }, { data: profiles }] = await Promise.all([
    admin
      .from("invoices")
      .select("id, user_id, plan, amount, currency, smartbill_series, smartbill_number, stripe_invoice_id, status, created_at, smartbill_error")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("users_profile").select("id, full_name"),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const enriched = (invoices ?? []).map((inv) => ({
    ...inv,
    user_name: profileMap.get(inv.user_id) ?? "—",
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <AdminInvoicesClient invoices={enriched} />
    </div>
  );
}
