import { requireAdmin } from "@/lib/admin-guard";
import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminStatsClient } from "@/components/admin/AdminStatsClient";
import { PLAN_PRICES } from "@/lib/plans";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { Skeleton } from "@/components/ui/skeleton";

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

/**
 * Coaja paginii pleaca imediat; graficele curg dupa ele.
 *
 * Aici sunt zece citiri platform-wide, iar sase dintre ele sunt `fetchAllRows`
 * — adica mai multe dus-intors pana se termina ferestrele de 1000 de randuri.
 * Nimic nu ajungea la browser pana nu se strangeau TOATE. Sub `<Suspense>`,
 * cadrul se trimite imediat si scheletul tine locul doar tablourilor.
 */
export default async function AdminStatsPage() {
  /* ⚠ Paza pe FIECARE pagina, nu doar in aspect. Vezi nota din layout. */
  await requireAdmin();
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Suspense fallback={<ScheletStatistici />}>
        <Tablouri />
      </Suspense>
    </div>
  );
}

function ScheletStatistici() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-36 rounded-xl" />

      {/* cardurile de sus: MRR / ARR / ARPU / LTV */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[136px] rounded-2xl" />
        ))}
      </div>

      {/* doua grafice pe rand */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[280px] rounded-2xl" />
        <Skeleton className="h-[280px] rounded-2xl" />
      </div>

      {/* grafic lat plus panoul lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-[260px] rounded-2xl lg:col-span-2" />
        <Skeleton className="h-[260px] rounded-2xl" />
      </div>
    </div>
  );
}

async function Tablouri() {
  const admin = createAdminClient();

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  // Toate seturile platform-wide se citesc in ferestre .range(): un query
  // simplu e trunchiat silentios la 1000 de randuri de PostgREST, iar cifrele
  // de aici (venituri, comenzi, MRR) trebuie sa fie complete.
  const [profiles, orders, invoices, businesses, tickets] = await Promise.all([
    fetchAllRows("admin.stats.profiles12m", (f, t) =>
      admin.from("users_profile").select("id, plan, created_at").gte("created_at", twelveMonthsAgo.toISOString()).order("id").range(f, t)),
    fetchAllRows("admin.stats.orders12m", (f, t) =>
      admin.from("orders").select("id, total, status, created_at, business_id").gte("created_at", twelveMonthsAgo.toISOString()).order("id").range(f, t)),
    fetchAllRows("admin.stats.invoices12m", (f, t) =>
      admin.from("invoices").select("id, amount, status, created_at, plan").gte("created_at", twelveMonthsAgo.toISOString()).order("id").range(f, t)),
    fetchAllRows("admin.stats.businesses", (f, t) =>
      admin.from("businesses").select("id, store_name, business_name, niche_id, type").order("id").range(f, t)),
    fetchAllRows("admin.stats.tickets12m", (f, t) =>
      admin.from("support_tickets").select("id, created_at").gte("created_at", twelveMonthsAgo.toISOString()).order("id").range(f, t)),
  ]);

  const months = buildMonthLabels(12);

  // Users by month
  const usersByMonth = months.map((m) => ({
    month: m,
    count: profiles.filter((p) => monthKey(p.created_at) === m).length,
  }));

  // Orders by month
  const ordersByMonth = months.map((m) => {
    const mo = orders.filter((o) => monthKey(o.created_at) === m);
    return {
      month: m,
      count: mo.length,
      revenue: mo.filter((o) => !["cancelled", "refunded"].includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0),
    };
  });

  // Invoice revenue by month (paid only)
  const invoicesByMonth = months.map((m) => {
    const mi = invoices.filter((i) => monthKey(i.created_at) === m && i.status === "paid" && i.plan !== "domain");
    return {
      month: m,
      count: mi.length,
      total: mi.reduce((s, i) => s + (i.amount ?? 0), 0),
    };
  });

  // Tickets by month
  const ticketsByMonth = months.map((m) => ({
    month: m,
    count: tickets.filter((t) => monthKey(t.created_at) === m).length,
  }));

  // Plan distribution (all time)
  const allProfiles = await fetchAllRows("admin.stats.allProfiles", (f, t) =>
    admin.from("users_profile").select("plan").order("id").range(f, t));
  const planCounts = allProfiles.reduce<Record<string, number>>((acc, p) => {
    acc[p.plan] = (acc[p.plan] ?? 0) + 1;
    return acc;
  }, {});

  // Niche distribution
  const nicheCounts = businesses.reduce<Record<string, number>>((acc, b) => {
    if (b.niche_id) acc[b.niche_id] = (acc[b.niche_id] ?? 0) + 1;
    return acc;
  }, {});

  // MRR / ARR: last 30 days paid invoices
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentPaidInvoices = await fetchAllRows("admin.stats.recentPaidInvoices", (f, t) =>
    admin
      .from("invoices")
      .select("amount")
      .eq("status", "paid")
      .neq("plan", "domain")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("id")
      .range(f, t));
  const mrr = recentPaidInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const arr = mrr * 12;

  // Plan-based MRR estimate: count active paid users x plan price
  const activePaidProfiles = await fetchAllRows("admin.stats.activePaidProfiles", (f, t) =>
    admin
      .from("users_profile")
      .select("plan")
      .in("plan", ["basic", "premium", "ultra"])
      .order("id")
      .range(f, t));
  const mrrByPlan = activePaidProfiles.reduce((s, p) => s + (PLAN_PRICES[p.plan] ?? 0), 0);

  // ARPU = total revenue / total paying users
  const totalPaidInvoices = invoices.filter((i) => i.status === "paid" && i.plan !== "domain");
  const totalInvRevenue = totalPaidInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const uniquePayers = new Set(totalPaidInvoices.map((i) => i.id)).size; // approximate
  const arpu = uniquePayers > 0 ? totalInvRevenue / uniquePayers : 0;

  // Churn: users on free plan who had paid invoices before (approximate)
  const allProfilesForChurn = await fetchAllRows("admin.stats.allProfilesForChurn", (f, t) =>
    admin.from("users_profile").select("id, plan, created_at").order("id").range(f, t));
  const freeUsers = allProfilesForChurn.filter((p) => p.plan === "free");
  const totalActive = allProfilesForChurn.length;
  const paidActive = activePaidProfiles.length;
  const churnRate = totalActive > 0 ? Math.round(((totalActive - paidActive - freeUsers.filter((u) => {
    // users who registered more than 30 days ago and are still free
    return new Date(u.created_at) < new Date(Date.now() - 30 * 86400000);
  }).length) / Math.max(totalActive, 1)) * 100) : 0;

  // LTV = ARPU * average lifetime (months) - simplified as ARPU * 12
  const ltv = arpu * 12;

  // Top 10 businesses by order count (all time)
  const allOrders = await fetchAllRows("admin.stats.allOrders", (f, t) =>
    admin.from("orders").select("business_id, total, status").order("id").range(f, t));
  const bizOrderMap = new Map<string, { count: number; revenue: number }>();
  for (const o of allOrders) {
    const curr = bizOrderMap.get(o.business_id) ?? { count: 0, revenue: 0 };
    curr.count += 1;
    if (!["cancelled", "refunded"].includes(o.status)) curr.revenue += o.total ?? 0;
    bizOrderMap.set(o.business_id, curr);
  }

  const topBusinesses = businesses
    .map((b) => ({
      name: b.store_name ?? b.business_name ?? "—",
      order_count: bizOrderMap.get(b.id)?.count ?? 0,
      revenue: bizOrderMap.get(b.id)?.revenue ?? 0,
    }))
    .sort((a, b) => b.order_count - a.order_count)
    .slice(0, 10);

  return (
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
  );
}
