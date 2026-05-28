import { createAdminClient } from "@/lib/supabase/admin";
import { AdminOverview } from "@/components/admin/AdminOverview";

export const metadata = { title: "Prezentare generala" };

export default async function AdminPage() {
  const admin = createAdminClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [
    { count: totalUsers },
    { count: newUsersThisMonth },
    { count: newUsersLastMonth },
    { data: revenueData },
    { data: revenueThisMonth },
    { count: activeBusinesses },
    { count: totalBusinesses },
    { count: totalOrders },
    { count: pendingSupport },
    { data: recentUsers },
    { data: recentTickets },
    { data: monthlySignups },
    { data: monthlyRevenue },
    { data: usersByPlan },
  ] = await Promise.all([
    admin.from("users_profile").select("*", { count: "exact", head: true }),
    admin.from("users_profile").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    admin.from("users_profile").select("*", { count: "exact", head: true }).gte("created_at", lastMonthStart).lt("created_at", monthStart),
    admin.from("invoices").select("amount").eq("status", "paid"),
    admin.from("invoices").select("amount").eq("status", "paid").gte("created_at", monthStart),
    admin.from("businesses").select("*", { count: "exact", head: true }).eq("is_published", true),
    admin.from("businesses").select("*", { count: "exact", head: true }),
    admin.from("orders").select("*", { count: "exact", head: true }),
    admin.from("support_tickets").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    admin.from("users_profile").select("id, full_name, plan, role, created_at").order("created_at", { ascending: false }).limit(8),
    admin.from("support_tickets").select("id, subject, status, priority, created_at, user_id").order("created_at", { ascending: false }).limit(6),
    Promise.resolve({ data: null }),
    admin.from("invoices").select("created_at, amount").eq("status", "paid").order("created_at", { ascending: false }).limit(200),
    admin.from("users_profile").select("plan").then(({ data }) => ({
      data: data ? Object.entries(
        data.reduce((acc: Record<string, number>, u) => ({ ...acc, [u.plan]: (acc[u.plan] ?? 0) + 1 }), {})
      ).map(([plan, count]) => ({ plan, count })) : null,
    })),
  ]);

  const totalRevenue = (revenueData ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
  const revenueMonth = (revenueThisMonth ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);

  // Build monthly revenue chart data (last 6 months)
  const revenueByMonth: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    revenueByMonth[key] = 0;
  }
  for (const inv of monthlyRevenue ?? []) {
    const key = inv.created_at.slice(0, 7);
    if (key in revenueByMonth) revenueByMonth[key] += inv.amount;
  }
  const revenueChart = Object.entries(revenueByMonth).map(([month, total]) => ({
    month: new Date(month + "-01").toLocaleDateString("ro-RO", { month: "short", year: "2-digit" }),
    total,
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <AdminOverview
        stats={{
          totalUsers: totalUsers ?? 0,
          newUsersThisMonth: newUsersThisMonth ?? 0,
          newUsersLastMonth: newUsersLastMonth ?? 0,
          totalRevenue,
          revenueMonth,
          activeBusinesses: activeBusinesses ?? 0,
          totalBusinesses: totalBusinesses ?? 0,
          totalOrders: totalOrders ?? 0,
          pendingSupport: pendingSupport ?? 0,
        }}
        recentUsers={recentUsers ?? []}
        recentTickets={recentTickets ?? []}
        revenueChart={revenueChart}
        usersByPlan={usersByPlan ?? []}
      />
    </div>
  );
}
