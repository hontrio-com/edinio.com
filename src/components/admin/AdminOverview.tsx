"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Users, Store, Receipt, LifeBuoy,
  TrendingUp, TrendingDown, ArrowRight, Calendar,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils/cn";

const PLAN_COLORS: Record<string, string> = {
  free: "#a1a1aa",
  basic: "#3b82f6",
  premium: "#8b5cf6",
  ultra: "#f59e0b",
};
const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit", basic: "Basic", premium: "Premium", ultra: "Ultra",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Deschis", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In lucru", color: "bg-amber-100 text-amber-700" },
  resolved: { label: "Rezolvat", color: "bg-green-100 text-green-700" },
  closed: { label: "Inchis", color: "bg-zinc-100 text-zinc-600" },
};

function fmt(v: number) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M lei`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k lei`;
  return `${v.toLocaleString("ro-RO")} lei`;
}

function StatCard({ label, value, sub, icon: Icon, trend, href, highlight }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number };
  href?: string;
  highlight?: boolean;
}) {
  const card = (
    <div className={cn(
      "rounded-2xl p-5 border transition-colors",
      highlight
        ? "bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20"
        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800",
      href && "hover:border-primary/30 cursor-pointer"
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", highlight ? "bg-primary/20" : "bg-primary/10")}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        {trend && (
          <div className={cn("flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full",
            trend.value >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          )}>
            {trend.value >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value >= 0 ? "+" : ""}{trend.value}%
          </div>
        )}
      </div>
      <p className="text-2xl font-black text-zinc-900 dark:text-white">{value}</p>
      <p className="text-sm text-zinc-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
    </div>
  );
  if (href) return <Link href={href}>{card}</Link>;
  return card;
}

export function AdminOverview({
  stats, recentUsers, recentTickets, revenueChart, usersByPlan, allInvoices,
}: {
  stats: {
    totalUsers: number; newUsersThisMonth: number; newUsersLastMonth: number;
    totalRevenue: number; revenueThisMonth: number; mrr: number; arr: number;
    activeBusinesses: number; totalBusinesses: number; pendingSupport: number;
  };
  recentUsers: { id: string; full_name: string; plan: string; role: string; created_at: string }[];
  recentTickets: { id: string; subject: string; status: string; priority: string; created_at: string }[];
  revenueChart: { month: string; total: number }[];
  usersByPlan: { plan: string; count: number }[];
  allInvoices: { amount: number; created_at: string }[];
}) {
  const userTrend = stats.newUsersLastMonth > 0
    ? Math.round(((stats.newUsersThisMonth - stats.newUsersLastMonth) / stats.newUsersLastMonth) * 100)
    : 0;

  // Date range picker for revenue
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);

  const rangeRevenue = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom + "T00:00:00Z").getTime() : 0;
    const to = dateTo ? new Date(dateTo + "T23:59:59Z").getTime() : Infinity;
    return allInvoices
      .filter((i) => {
        const t = new Date(i.created_at).getTime();
        return t >= from && t <= to;
      })
      .reduce((s, i) => s + i.amount, 0);
  }, [allInvoices, dateFrom, dateTo]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Prezentare generala</h1>
        <p className="text-sm text-zinc-500 mt-1">Toate datele platformei Edinio in timp real</p>
      </div>

      {/* Revenue highlight row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-5">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">MRR (30 zile)</p>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{fmt(stats.mrr)}</p>
          <p className="text-xs text-zinc-500 mt-1">ARR estimat: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{fmt(stats.arr)}</span></p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Venituri totale</p>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{fmt(stats.totalRevenue)}</p>
          <p className="text-xs text-zinc-400 mt-1">Luna aceasta: <span className="font-semibold text-zinc-600 dark:text-zinc-300">{fmt(stats.revenueThisMonth)}</span></p>
        </div>

        {/* Revenue by date range */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Venituri pe perioada
          </p>
          <p className="text-3xl font-black text-zinc-900 dark:text-white mb-3">{fmt(rangeRevenue)}</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              max={dateTo || today}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 h-7 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-xs text-zinc-400">—</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={today}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 h-7 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-1.5 mt-2">
            {[
              { label: "Azi", from: today, to: today },
              { label: "7 zile", from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), to: today },
              { label: "Luna", from: firstOfMonth, to: today },
            ].map((p) => (
              <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to); }}
                className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors",
                  dateFrom === p.from && dateTo === p.to
                    ? "bg-primary text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                )}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Utilizatori totali"
          value={stats.totalUsers.toLocaleString("ro-RO")}
          sub={`+${stats.newUsersThisMonth} luna aceasta`}
          icon={Users}
          trend={{ value: userTrend }}
          href="/admin/utilizatori"
        />
        <StatCard
          label="Magazine active"
          value={stats.activeBusinesses}
          sub={`${stats.totalBusinesses} totale`}
          icon={Store}
          href="/admin/magazine"
        />
        <StatCard
          label="Suport pending"
          value={stats.pendingSupport}
          sub="tichete deschise/in lucru"
          icon={LifeBuoy}
          href="/admin/suport"
        />
        <StatCard
          label="Facturi"
          value={allInvoices.length.toLocaleString("ro-RO")}
          sub="toate platile procesate"
          icon={Receipt}
          href="/admin/facturi"
        />
      </div>

      {/* Suport alert */}
      {stats.pendingSupport > 0 && (
        <Link href="/admin/suport">
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl hover:border-amber-400 transition-colors">
            <LifeBuoy className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {stats.pendingSupport} {stats.pendingSupport === 1 ? "tichet asteapta" : "tichete asteapta"} raspuns
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Click pentru a vedea si raspunde</p>
            </div>
            <ArrowRight className="h-4 w-4 text-amber-600" />
          </div>
        </Link>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4">Venituri din abonamente (ultimele 6 luni, lei)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="adminRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1AB554" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#1AB554" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => [`${v} lei`, "Venituri"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="total" stroke="#1AB554" strokeWidth={2} fill="url(#adminRevGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4">Utilizatori pe plan</h2>
          {usersByPlan.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={usersByPlan} dataKey="count" nameKey="plan" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                    {usersByPlan.map((entry) => (
                      <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] ?? "#a1a1aa"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {usersByPlan.map((item) => (
                  <div key={item.plan} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PLAN_COLORS[item.plan] ?? "#a1a1aa" }} />
                      <span className="text-zinc-600 dark:text-zinc-400">{PLAN_LABELS[item.plan] ?? item.plan}</span>
                    </div>
                    <span className="font-semibold text-zinc-900 dark:text-white">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-400 text-center py-8">Nu exista date</p>
          )}
        </div>
      </div>

      {/* Recent data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Utilizatori recenti</h2>
            <Link href="/admin/utilizatori" className="text-xs text-primary hover:underline flex items-center gap-1">
              Toti <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {recentUsers.map((u) => (
              <Link key={u.id} href={`/admin/utilizatori/${u.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                  {u.full_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{u.full_name}</p>
                  <p className="text-xs text-zinc-400">{new Date(u.created_at).toLocaleDateString("ro-RO")}</p>
                </div>
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  u.plan === "free" ? "bg-zinc-100 text-zinc-600" :
                  u.plan === "basic" ? "bg-blue-100 text-blue-700" :
                  u.plan === "premium" ? "bg-purple-100 text-purple-700" :
                  "bg-amber-100 text-amber-700"
                )}>{PLAN_LABELS[u.plan] ?? u.plan}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Tichete suport recente</h2>
            <Link href="/admin/suport" className="text-xs text-primary hover:underline flex items-center gap-1">
              Toate <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {recentTickets.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-8">Niciun tichet</p>
            ) : recentTickets.map((t) => {
              const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.open;
              return (
                <Link key={t.id} href={`/admin/suport/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{t.subject}</p>
                    <p className="text-xs text-zinc-400">{new Date(t.created_at).toLocaleDateString("ro-RO")}</p>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0", sc.color)}>{sc.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
