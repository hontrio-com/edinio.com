import { createAdminClient } from "@/lib/supabase/admin";
import { AdminStatsClient } from "@/components/admin/AdminStatsClient";
import { PLAN_PRICES } from "@/lib/plans";

export const metadata = { title: "Statistici" };

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthLabels(count = 12) {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export default async function AdminStatsPage() {
  const admin = createAdminClient();

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const [
    { data: profiles },
    { data: orders },
    { data: invoices },
    { data: businesses },
    { data: tickets },
  ] = await Promise.all([
    admin.from("users_profile").select("id, plan, created_at").gte("created_at", twelveMonthsAgo.toISOString()),
    admin.from("orders").select("id, total, status, created_at, business_id").gte("created_at", twelveMonthsAgo.toISOString()),
    admin.from("invoices").select("id, amount, status, created_at").gte("created_at", twelveMonthsAgo.toISOString()),
    admin.from("businesses").select("id, store_name, business_name, niche_id, type"),
    admin.from("support_tickets").select("id, created_at").gte("created_at", twelveMonthsAgo.toISOString()),
  ]);

  const months = buildMonthLabels(12);

  // Users by month
  const usersByMonth = months.map((m) => ({
    month: m,
    count: (profiles ?? []).filter((p) => monthKey(p.created_at) === m).length,
  }));

  // Orders by month
  const ordersByMonth = months.map((m) => {
    const mo = (orders ?? []).filter((o) => monthKey(o.created_at) === m);
    return {
      month: m,
      count: mo.length,
      revenue: mo.filter((o) => !["cancelled", "refunded"].includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0),
    };
  });

  // Invoice revenue by month (paid only)
  const invoicesByMonth = months.map((m) => {
    const mi = (invoices ?? []).filter((i) => monthKey(i.created_at) === m && i.status === "paid");
    return {
      month: m,
      count: mi.length,
      total: mi.reduce((s, i) => s + (i.amount ?? 0), 0) / 100,
    };
  });

  // Tickets by month
  const ticketsByMonth = months.map((m) => ({
    month: m,
    count: (tickets ?? []).filter((t) => monthKey(t.created_at) === m).length,
  }));

  // Plan distribution (all time)
  const { data: allProfiles } = await admin.from("users_profile").select("plan");
  const planCounts = (allProfiles ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.plan] = (acc[p.plan] ?? 0) + 1;
    return acc;
  }, {});

  // Niche distribution
  const nicheCounts = (businesses ?? []).reduce<Record<string, number>>((acc, b) => {
    if (b.niche_id) acc[b.niche_id] = (acc[b.niche_id] ?? 0) + 1;
    return acc;
  }, {});

  // MRR / ARR: last 30 days paid invoices
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: recentPaidInvoices } = await admin
    .from("invoices")
    .select("amount")
    .eq("status", "paid")
    .gte("created_at", thirtyDaysAgo.toISOString());
  const mrr = (recentPaidInvoices ?? []).reduce((s, i) => s + (i.amount ?? 0), 0) / 100;
  const arr = mrr * 12;

  // Plan-based MRR estimate: count active paid users x plan price
  const { data: activePaidProfiles } = await admin
    .from("users_profile")
    .select("plan")
    .in("plan", ["basic", "premium", "ultra"]);
  const mrrByPlan = (activePaidProfiles ?? []).reduce((s, p) => s + (PLAN_PRICES[p.plan] ?? 0), 0);

  // ARPU = total revenue / total paying users
  const totalPaidInvoices = (invoices ?? []).filter((i) => i.status === "paid");
  const totalInvRevenue = totalPaidInvoices.reduce((s, i) => s + (i.amount ?? 0), 0) / 100;
  const uniquePayers = new Set(totalPaidInvoices.map((i) => i.id)).size; // approximate
  const arpu = uniquePayers > 0 ? totalInvRevenue / uniquePayers : 0;

  // Churn: users on free plan who had paid invoices before (approximate)
  const { data: allProfilesForChurn } = await admin.from("users_profile").select("id, plan, created_at");
  const freeUsers = (allProfilesForChurn ?? []).filter((p) => p.plan === "free");
  const paidUserIds = new Set((activePaidProfiles ?? []).map((p) => p.plan)); // not useful, let's count differently
  const totalActive = (allProfilesForChurn ?? []).length;
  const paidActive = (activePaidProfiles ?? []).length;
  const churnRate = totalActive > 0 ? Math.round(((totalActive - paidActive - freeUsers.filter((u) => {
    // users who registered more than 30 days ago and are still free
    return new Date(u.created_at) < new Date(Date.now() - 30 * 86400000);
  }).length) / Math.max(totalActive, 1)) * 100) : 0;

  // LTV = ARPU * average lifetime (months) - simplified as ARPU * 12
  const ltv = arpu * 12;

  // Top 10 businesses by order count (all time)
  const { data: allOrders } = await admin.from("orders").select("business_id, total, status");
  const bizOrderMap = new Map<string, { count: number; revenue: number }>();
  for (const o of allOrders ?? []) {
    const curr = bizOrderMap.get(o.business_id) ?? { count: 0, revenue: 0 };
    curr.count += 1;
    if (!["cancelled", "refunded"].includes(o.status)) curr.revenue += o.total ?? 0;
    bizOrderMap.set(o.business_id, curr);
  }

  const topBusinesses = (businesses ?? [])
    .map((b) => ({
      name: b.store_name ?? b.business_name ?? "—",
      order_count: bizOrderMap.get(b.id)?.count ?? 0,
      revenue: bizOrderMap.get(b.id)?.revenue ?? 0,
    }))
    .sort((a, b) => b.order_count - a.order_count)
    .slice(0, 10);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminStatsClient
        usersByMonth={usersByMonth}
        ordersByMonth={ordersByMonth}
        invoicesByMonth={invoicesByMonth}
        ticketsByMonth={ticketsByMonth}
        planCounts={planCounts}
        nicheCounts={nicheCounts}
        topBusinesses={topBusinesses}
        mrr={mrr}
        arr={arr}
        mrrByPlan={mrrByPlan}
        arpu={Math.round(arpu)}
        ltv={Math.round(ltv)}
        churnRate={Math.max(0, churnRate)}
        totalPaidUsers={paidActive}
        totalFreeUsers={freeUsers.length}
      />
    </div>
  );
}
