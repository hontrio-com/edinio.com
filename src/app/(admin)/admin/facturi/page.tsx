import { createAdminClient } from "@/lib/supabase/admin";
import { AdminInvoicesClient } from "@/components/admin/AdminInvoicesClient";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export const metadata = { title: "Facturi" };

export default async function AdminInvoicesPage() {
  const admin = createAdminClient();

  // Lista ramane la ultimele 500; harta de nume trebuie completa (peste 1000
  // de useri, numele apareau "—" din cauza cap-ului PostgREST).
  const [{ data: invoices }, profiles] = await Promise.all([
    admin
      .from("invoices")
      .select("id, user_id, plan, amount, currency, smartbill_series, smartbill_number, stripe_invoice_id, status, created_at, smartbill_error")
      .order("created_at", { ascending: false })
      .limit(500),
    fetchAllRows("admin.invoices.profiles", (f, t) =>
      admin.from("users_profile").select("id, full_name").order("id").range(f, t)),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.id, p.full_name]));

  const enriched = (invoices ?? []).map((inv) => ({
    ...inv,
    user_name: profileMap.get(inv.user_id) ?? "—",
  }));

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminInvoicesClient invoices={enriched} />
    </div>
  );
}
