import { createAdminClient, listAllAuthUsers } from "@/lib/supabase/admin";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export const metadata = { title: "Utilizatori" };

export default async function AdminUsersPage() {
  const admin = createAdminClient();

  // Ferestre .range() peste cap-ul silentios de 1000 de randuri PostgREST.
  const profiles = await fetchAllRows("admin.users.profiles", (f, t) =>
    admin
      .from("users_profile")
      .select("id, full_name, plan, role, created_at, avatar_url, plan_expires_at, suspended_until, onboarding_step, onboarding_completed" as "id, full_name, plan, role, created_at, avatar_url, plan_expires_at, suspended_until")
      .order("created_at", { ascending: false })
      .order("id")
      .range(f, t));

  // Get auth users (email, last_sign_in) — paginated past the 1000 cap
  const authUsers = await listAllAuthUsers(admin);
  const authMap = new Map(authUsers.map((u) => [u.id, u]));

  // Get business counts per user
  const bizCounts = await fetchAllRows("admin.users.bizCounts", (f, t) =>
    admin.from("businesses").select("user_id").order("id").range(f, t));

  const bizCountMap: Record<string, number> = {};
  for (const b of bizCounts) {
    bizCountMap[b.user_id] = (bizCountMap[b.user_id] ?? 0) + 1;
  }

  const users = profiles.map((p) => {
    const auth = authMap.get(p.id);
    return {
      ...p,
      email: auth?.email ?? "",
      last_sign_in_at: auth?.last_sign_in_at ?? null,
      email_confirmed: !!auth?.email_confirmed_at,
      businesses_count: bizCountMap[p.id] ?? 0,
      plan_expires_at: p.plan_expires_at ?? null,
      suspended_until: p.suspended_until ?? null,
      onboarding_step: ((p as unknown as Record<string, unknown>).onboarding_step as string) ?? "registered",
      onboarding_completed: ((p as unknown as Record<string, unknown>).onboarding_completed as boolean) ?? false,
    };
  });

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminUsersClient users={users} />
    </div>
  );
}
