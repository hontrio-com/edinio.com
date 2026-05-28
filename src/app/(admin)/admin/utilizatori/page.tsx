import { createAdminClient } from "@/lib/supabase/admin";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";

export const metadata = { title: "Utilizatori" };

export default async function AdminUsersPage() {
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("users_profile")
    .select("id, full_name, plan, role, created_at, avatar_url")
    .order("created_at", { ascending: false });

  // Get auth users (email, last_sign_in)
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authMap = new Map(authData?.users?.map((u) => [u.id, u]) ?? []);

  // Get business counts per user
  const { data: bizCounts } = await admin
    .from("businesses")
    .select("user_id");

  const bizCountMap: Record<string, number> = {};
  for (const b of bizCounts ?? []) {
    bizCountMap[b.user_id] = (bizCountMap[b.user_id] ?? 0) + 1;
  }

  const users = (profiles ?? []).map((p) => {
    const auth = authMap.get(p.id);
    return {
      ...p,
      email: auth?.email ?? "",
      last_sign_in_at: auth?.last_sign_in_at ?? null,
      email_confirmed: !!auth?.email_confirmed_at,
      businesses_count: bizCountMap[p.id] ?? 0,
    };
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <AdminUsersClient users={users} />
    </div>
  );
}
