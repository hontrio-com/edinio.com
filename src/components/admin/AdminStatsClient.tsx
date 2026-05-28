"use client";

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils/cn";

interface Props {
  usersByMonth: { month: string; count: number }[];
  ordersByMonth: { month: string; count: number; revenue: number }[];
  invoicesByMonth: { month: string; count: number; total: number }[];
  ticketsByMonth: { month: string; count: number }[];
  planCounts: Record<string, number>;
  nicheCounts: Record<string, number>;
  topBusinesses: { name: string; order_count: number; revenue: number }[];
  mrr?: number;
  arr?: number;
  mrrByPlan?: number;
}

const PLAN_COLORS: Record<string, string> = {
  free: "#a1a1aa",
  starter: "#3b82f6",
  pro: "#1AB554",
  business: "#f59e0b",
};
const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit", starter: "Starter", pro: "Pro", business: "Business",
};

const CHART_COLORS = ["#1AB554", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

function shortMonth(m: string) {
  const [year, month] = m.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("ro-RO", { month: "short" });
}

function StatCard({ label, value, sub, color = "text-zinc-900 dark:text-white" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
      <p className={cn("text-2xl font-black", color)}>{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function AdminStatsClient({
  usersByMonth, ordersByMonth, invoicesByMonth, ticketsByMonth,
  planCounts, nicheCounts, topBusinesses,
  mrr = 0, arr = 0, mrrByPlan = 0,
}: Props) {
  const totalUsers = Object.values(planCounts).reduce((s, v) => s + v, 0);
  const totalOrders = ordersByMonth.reduce((s, m) => s + m.count, 0);
  const totalRevOrders = ordersByMonth.reduce((s, m) => s + m.revenue, 0);
  const totalRevInv = invoicesByMonth.reduce((s, m) => s + m.total, 0);
  const totalTickets = ticketsByMonth.reduce((s, m) => s + m.count, 0);
  const newUsersLast = usersByMonth[usersByMonth.length - 1]?.count ?? 0;

  const planData = Object.entries(planCounts).map(([k, v]) => ({
    name: PLAN_LABELS[k] ?? k,
    value: v,
    color: PLAN_COLORS[k] ?? "#a1a1aa",
  }));

  const nicheData = Object.entries(nicheCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] }));

  const combinedMonthly = usersByMonth.map((u, i) => ({
    month: shortMonth(u.month),
    "Utilizatori noi": u.count,
    "Comenzi": ordersByMonth[i]?.count ?? 0,
    "Tichete suport": ticketsByMonth[i]?.count ?? 0,
  }));

  const revenueMonthly = ordersByMonth.map((o, i) => ({
    month: shortMonth(o.month),
    "Venituri comenzi (lei)": Math.round(o.revenue),
    "Abonamente (lei)": Math.round(invoicesByMonth[i]?.total ?? 0),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Statistici</h1>
        <p className="text-sm text-zinc-500 mt-1">Ultimele 12 luni</p>
      </div>

      {/* MRR / ARR highlight */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-5">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">MRR (incasari 30 zile)</p>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{mrr.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei</p>
          <p className="text-xs text-zinc-500 mt-1">Din facturi platite in ultimele 30 de zile</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-50/50 dark:from-amber-950/20 dark:to-amber-950/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">ARR estimat</p>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{arr.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei</p>
          <p className="text-xs text-zinc-500 mt-1">MRR × 12</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-950/20 dark:to-blue-950/10 border border-blue-200 dark:border-blue-800 rounded-2xl p-5">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">MRR dupa plan activ</p>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{mrrByPlan.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei</p>
          <p className="text-xs text-zinc-500 mt-1">Utilizatori platitori × pretul planului</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Utilizatori totali" value={totalUsers} color="text-zinc-900 dark:text-white" />
        <StatCard label="Noi luna aceasta" value={newUsersLast} color="text-blue-600" />
        <StatCard label="Comenzi (12 luni)" value={totalOrders} color="text-primary" />
        <StatCard label="Venituri comenzi" value={`${totalRevOrders.toLocaleString("ro-RO")} lei`} color="text-primary" />
        <StatCard label="Abonamente incasate" value={`${totalRevInv.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei`} color="text-amber-600" />
        <StatCard label="Tichete suport" value={totalTickets} color="text-zinc-600" />
      </div>

      {/* Activity by month */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-5">Activitate lunara</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={combinedMonthly} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Utilizatori noi" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Comenzi" fill="#1AB554" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Tichete suport" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-5">Venituri lunare (lei)</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={revenueMonthly}>
            <defs>
              <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1AB554" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#1AB554" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradInv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="Venituri comenzi (lei)" stroke="#1AB554" fill="url(#gradOrders)" strokeWidth={2} />
            <Area type="monotone" dataKey="Abonamente (lei)" stroke="#f59e0b" fill="url(#gradInv)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Plan + Niche distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-5">Distributie plan</h2>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={planData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                  {planData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {planData.map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">{p.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-5">Distributie nisa</h2>
          {nicheData.length === 0 ? (
            <p className="text-sm text-zinc-400">Nu exista date suficiente.</p>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={nicheData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                    {nicheData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {nicheData.map((n) => (
                  <div key={n.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: n.color }} />
                      <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate max-w-[100px]">{n.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white">{n.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top businesses */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-5">Top 10 magazine dupa comenzi</h2>
        {topBusinesses.length === 0 ? (
          <p className="text-sm text-zinc-400">Nu exista date.</p>
        ) : (
          <div className="space-y-3">
            {topBusinesses.map((b, i) => {
              const maxOrders = topBusinesses[0]?.order_count ?? 1;
              const pct = maxOrders > 0 ? (b.order_count / maxOrders) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-zinc-400 w-5 text-right flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{b.name}</span>
                      <span className="text-xs text-zinc-500 ml-2 flex-shrink-0">{b.order_count} comenzi — {b.revenue.toLocaleString("ro-RO")} lei</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
