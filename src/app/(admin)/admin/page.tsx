import { createAdminClient } from "@/lib/supabase/admin";
import { AdminOverview } from "@/components/admin/AdminOverview";

export const metadata = { title: "Prezentare generala" };

export default async function AdminPage() {
  const admin = createAdminClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [
    { count: totalUsers },
    { count: newUsersThisMonth },
    { count: newUsersLastMonth },
    { count: activeBusinesses },
    { count: totalBusinesses },
    { count: pendingSupport },
    { data: recentUsers },
    { data: recentTickets },
    { data: allInvoices },
    { data: mrrInvoices },
    { data: usersByPlanRaw },
  ] = await Promise.all([
    admin.from("users_profile").select("*", { count: "exact", head: true }),
    admin.from("users_profile").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    admin.from("users_profile").select("*", { count: "exact", head: true }).gte("created_at", lastMonthStart).lt("created_at", monthStart),
    admin.from("businesses").select("*", { count: "exact", head: true }).eq("is_published", true),
    admin.from("businesses").select("*", { count: "exact", head: true }),
    admin.from("support_tickets").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    admin.from("users_profile").select("id, full_name, plan, role, created_at").order("created_at", { ascending: false }).limit(8),
    admin.from("support_tickets").select("id, subject, status, priority, created_at").order("created_at", { ascending: false }).limit(6),
    // All paid invoices for revenue by date picker (keep it small — only amount + date)
    admin.from("invoices").select("amount, created_at").eq("status", "paid").order("created_at", { ascending: false }),
    // MRR: last 30 days
    admin.from("invoices").select("amount").eq("status", "paid").gte("created_at", thirtyDaysAgo),
    admin.from("users_profile").select("plan"),
  ]);

  // Revenue calculations
  const totalRevenue = (allInvoices ?? []).reduce((s, r) => s + r.amount, 0);
  const revenueThisMonth = (allInvoices ?? [])
    .filter((i) => i.created_at >= monthStart)
    .reduce((s, r) => s + r.amount, 0);
  const mrr = (mrrInvoices ?? []).reduce((s, r) => s + r.amount, 0) / 100;
  const arr = mrr * 12;

  // Plan distribution
  const usersByPlan = Object.entries(
    (usersByPlanRaw ?? []).reduce<Record<string, number>>((acc, u) => {
      acc[u.plan] = (acc[u.plan] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([plan, count]) => ({ plan, count }));

  // Revenue chart: last 6 months
  const revenueByMonth: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    revenueByMonth[key] = 0;
  }
  for (const inv of allInvoices ?? []) {
    const key = inv.created_at.slice(0, 7);
    if (key in revenueByMonth) revenueByMonth[key] += inv.amount;
  }
  const revenueChart = Object.entries(revenueByMonth).map(([month, total]) => ({
    month: new Date(month + "-01").toLocaleDateString("ro-RO", { month: "short", year: "2-digit" }),
    total: Math.round(total / 100),
  }));

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminOverview
        stats={{
          totalUsers: totalUsers ?? 0,
          newUsersThisMonth: newUsersThisMonth ?? 0,
          newUsersLastMonth: newUsersLastMonth ?? 0,
          totalRevenue: Math.round(totalRevenue / 100),
          revenueThisMonth: Math.round(revenueThisMonth / 100),
          mrr,
          arr,
          activeBusinesses: activeBusinesses ?? 0,
          totalBusinesses: totalBusinesses ?? 0,
          pendingSupport: pendingSupport ?? 0,
        }}
        recentUsers={recentUsers ?? []}
        recentTickets={recentTickets ?? []}
        revenueChart={revenueChart}
        usersByPlan={usersByPlan}
        allInvoices={(allInvoices ?? []).map((i) => ({ amount: Math.round(i.amount / 100), created_at: i.created_at }))}
      />
    </div>
  );
}
