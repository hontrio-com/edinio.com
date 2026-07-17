import { createAdminClient, listAllAuthUsers } from "@/lib/supabase/admin";
import { AdminSupportClient } from "@/components/admin/AdminSupportClient";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export const metadata = { title: "Suport" };

export default async function AdminSupportPage() {
  const admin = createAdminClient();

  // Ferestre .range() peste cap-ul silentios de 1000 de randuri PostgREST.
  const [tickets, profiles] = await Promise.all([
    fetchAllRows("admin.support.tickets", (f, t) =>
      admin.from("support_tickets").select("*").order("updated_at", { ascending: false }).order("id").range(f, t)),
    fetchAllRows("admin.support.profiles", (f, t) =>
      admin.from("users_profile").select("id, full_name").order("id").range(f, t)),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // Get emails from auth — paginated past the 1000 cap
  const authUsers = await listAllAuthUsers(admin);
  const emailMap = new Map(authUsers.map((u) => [u.id, u.email ?? ""]));

  const enriched = tickets.map((t) => ({
    ...t,
    user_name: profileMap.get(t.user_id)?.full_name ?? "Anonim",
    user_email: emailMap.get(t.user_id) ?? "",
  }));

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminSupportClient tickets={enriched} />
    </div>
  );
}
