import { createAdminClient } from "@/lib/supabase/admin";
import { AdminActivityClient } from "@/components/admin/AdminActivityClient";

export const metadata = { title: "Activitate" };

export default async function AdminActivityPage() {
  const admin = createAdminClient();

  const [{ data: logs }, { data: profiles }] = await Promise.all([
    admin
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("users_profile").select("id, full_name").eq("role", "admin"),
  ]);

  const adminNames: Record<string, string> = {};
  for (const p of profiles ?? []) {
    adminNames[p.id] = p.full_name;
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminActivityClient logs={logs ?? []} adminNames={adminNames} />
    </div>
  );
}
