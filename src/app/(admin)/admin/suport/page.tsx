import { createAdminClient } from "@/lib/supabase/admin";
import { AdminSupportClient } from "@/components/admin/AdminSupportClient";

export const metadata = { title: "Suport" };

export default async function AdminSupportPage() {
  const admin = createAdminClient();

  const [{ data: tickets }, { data: profiles }] = await Promise.all([
    admin.from("support_tickets").select("*").order("updated_at", { ascending: false }),
    admin.from("users_profile").select("id, full_name"),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Get emails from auth
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map(authData?.users?.map((u) => [u.id, u.email ?? ""]) ?? []);

  const enriched = (tickets ?? []).map((t) => ({
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
