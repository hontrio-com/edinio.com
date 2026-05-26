"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, ShoppingCart, BadgeDollarSign, Activity,
  Eye, Smartphone, Monitor, Tablet, Globe, Radio,
  Users, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/format";
import { RomaniaMap } from "@/components/dashboard/RomaniaMap";
import { createClient } from "@/lib/supabase/client";

interface DayData {
  date: string;
  label: string;
  revenue: number;
  orders: number;
}

interface Metrics {
  totalRevenue: number;
  ordersCount: number;
  aov: number;
  conversionRate: number;
  visitsCount: number;
  prevRevenue: number;
  prevOrdersCount: number;
}

interface SourceEntry { source: string; count: number }
interface DeviceEntry { device: string; count: number }
interface CountyEntry { county: string; code: string; orders: number }

interface Props {
  period: number;
  salesByDay: DayData[];
  metrics: Metrics;
  trafficSources: SourceEntry[];
  devices: DeviceEntry[];
  ordersByCounty: CountyEntry[];
  businessId: string;
  svgContent: string;
  primaryColor: string;
}

const PERIOD_OPTIONS = [
  { value: "7",  label: "7 zile" },
  { value: "30", label: "30 zile" },
  { value: "90", label: "90 zile" },
];

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct", google: "Google", facebook: "Facebook",
  instagram: "Instagram", tiktok: "TikTok", other: "Altele",
};

function pct(value: number, prev: number) {
  if (prev === 0) return null;
  return Math.round(((value - prev) / prev) * 100);
}

function StatCard({
  label, value, sub, trend, icon: Icon, color,
}: {
  label: string; value: string; sub?: string; trend?: number | null;
  icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", color)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        {trend !== null && trend !== undefined && (
          <div className={cn(
            "flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full",
            trend >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
          )}>
            {trend >= 0
              ? <ArrowUpRight className="h-3 w-3" />
              : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// Custom recharts tooltip
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      <p className="text-gray-500">Vânzări: <span className="font-bold text-gray-900">{formatPrice(payload[0]?.value ?? 0)}</span></p>
      {payload[1] && (
        <p className="text-gray-500">Comenzi: <span className="font-bold text-gray-900">{payload[1].value}</span></p>
      )}
    </div>
  );
}

function ProgressRow({ label, count, total, color }: {
  label: string; count: number; total: number; color?: string;
}) {
  const pctVal = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pctVal}%`, backgroundColor: color ?? "var(--color-primary, #1AB554)" }}
        />
      </div>
      <span className="text-foreground font-semibold w-10 text-right tabular-nums">{count}</span>
      <span className="text-muted-foreground w-9 text-right tabular-nums">{pctVal}%</span>
    </div>
  );
}

/* ── Live tab ─────────────────────────────────────────────────────────────── */
function LiveTab({ businessId, ordersByCounty, svgContent, primaryColor }: {
  businessId: string;
  ordersByCounty: CountyEntry[];
  svgContent: string;
  primaryColor: string;
}) {
  const [liveEvents, setLiveEvents] = useState<{ id: string; created_at: string; device: string | null; source: string | null }[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLive = useCallback(async () => {
    const supabase = createClient();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("site_analytics")
      .select("id, created_at, device, source")
      .eq("business_id", businessId)
      .gte("created_at", fiveMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(20);
    setLiveEvents(data ?? []);
    setLiveCount(data?.length ?? 0);
    setLastUpdated(new Date());
  }, [businessId]);

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 30_000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  return (
    <div className="space-y-6">
      {/* Live counter */}
      <div className="bg-white border border-border rounded-xl p-6 flex items-center gap-5">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center">
            <Radio className="h-7 w-7 text-green-600" />
          </div>
          {liveCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-foreground">{liveCount}</span>
            <span className="text-sm text-muted-foreground">
              {liveCount === 1 ? "vizitator activ" : "vizitatori activi"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            In ultimele 5 minute{lastUpdated && ` · actualizat la ${lastUpdated.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
          </p>
        </div>
        {liveCount > 0 && (
          <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
            LIVE
          </div>
        )}
      </div>

      {/* Recent events feed */}
      {liveEvents.length > 0 && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Activitate recenta</h3>
            <span className="text-xs text-muted-foreground">{liveEvents.length} eventi</span>
          </div>
          <div className="divide-y divide-border max-h-64 overflow-y-auto">
            {liveEvents.map(ev => {
              const DeviceIcon = ev.device === "mobile" ? Smartphone : ev.device === "tablet" ? Tablet : Monitor;
              const mins = Math.floor((Date.now() - new Date(ev.created_at).getTime()) / 60000);
              return (
                <div key={ev.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <DeviceIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground flex-1">
                    Vizita via <span className="font-medium">{SOURCE_LABELS[ev.source ?? ""] ?? ev.source ?? "direct"}</span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {mins === 0 ? "acum" : `${mins}m`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Romania map */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Comenzi pe judet</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Total comenzi primite per regiune</p>
        </div>
        <div className="p-4">
          <div className="max-w-2xl mx-auto">
            <RomaniaMap
              svgContent={svgContent}
              countyData={ordersByCounty}
              primaryColor={primaryColor}
            />
          </div>
        </div>
        {/* Legend */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" /> Fara comenzi
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: `rgba(26,181,84,0.3)` }} /> Putine
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: `rgba(26,181,84,0.7)` }} /> Mediu
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: `rgba(26,181,84,1)` }} /> Ridicat
          </span>
        </div>
        {/* Top counties */}
        {ordersByCounty.filter(c => c.orders > 0).length > 0 && (
          <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ordersByCounty
              .filter(c => c.orders > 0)
              .sort((a, b) => b.orders - a.orders)
              .slice(0, 6)
              .map(c => (
                <div key={c.code} className="flex items-center justify-between text-sm bg-muted/40 rounded-lg px-3 py-2">
                  <span className="text-foreground font-medium truncate">{c.county}</span>
                  <span className="text-muted-foreground font-semibold ml-2">{c.orders}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export function AnalyticsClient({
  period, salesByDay, metrics, trafficSources, devices,
  ordersByCounty, businessId, svgContent, primaryColor,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"overview" | "live">("overview");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function setPeriod(p: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", p);
    router.push(`?${params.toString()}`);
  }

  const totalVisits = trafficSources.reduce((s, x) => s + x.count, 0);
  const totalDevices = devices.reduce((s, x) => s + x.count, 0);

  const revenueTrend = pct(metrics.totalRevenue, metrics.prevRevenue);
  const ordersTrend = pct(metrics.ordersCount, metrics.prevOrdersCount);

  const hasOrders = metrics.ordersCount > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">Statistici</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Performanta magazinului tau</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-muted rounded-xl p-1 gap-0.5">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  String(period) === opt.value
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Tab switcher */}
          <div className="flex bg-muted rounded-xl p-1 gap-0.5">
            <button
              type="button"
              onClick={() => setTab("overview")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                tab === "overview" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Activity className="h-3.5 w-3.5" />
              Prezentare
            </button>
            <button
              type="button"
              onClick={() => setTab("live")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                tab === "live" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Radio className="h-3.5 w-3.5" />
              Live
            </button>
          </div>
        </div>
      </div>

      {/* ── OVERVIEW TAB ──────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={`Vanzari (${period} zile)`}
              value={formatPrice(metrics.totalRevenue)}
              trend={revenueTrend}
              icon={BadgeDollarSign}
              color="bg-green-50 text-green-600"
            />
            <StatCard
              label="Comenzi"
              value={String(metrics.ordersCount)}
              sub={`vs ${metrics.prevOrdersCount} perioada anterioara`}
              trend={ordersTrend}
              icon={ShoppingCart}
              color="bg-blue-50 text-blue-600"
            />
            <StatCard
              label="Valoare medie comanda"
              value={hasOrders ? formatPrice(metrics.aov) : "-"}
              icon={TrendingUp}
              color="bg-purple-50 text-purple-600"
            />
            <StatCard
              label="Rata de conversie"
              value={metrics.visitsCount > 0 ? `${metrics.conversionRate.toFixed(1)}%` : "-"}
              sub={`${metrics.visitsCount} vizite`}
              icon={Eye}
              color="bg-amber-50 text-amber-600"
            />
          </div>

          {/* Sales chart */}
          <div className="bg-white border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Vanzari zilnice - ultimele {period} zile
            </h2>
            {!mounted ? (
              <div className="h-56 bg-muted animate-pulse rounded-xl" />
            ) : !hasOrders ? (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                Nu exista vanzari in aceasta perioada
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={salesByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickLine={false}
                    axisLine={false}
                    interval={period === 7 ? 0 : period === 30 ? 4 : 9}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "#f9fafb" }} />
                  <Bar
                    dataKey="revenue"
                    fill={primaryColor}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Traffic sources + Devices */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Surse de trafic</h2>
              </div>
              {totalVisits === 0 ? (
                <p className="text-sm text-muted-foreground">Nu exista date</p>
              ) : (
                <div className="space-y-3">
                  {trafficSources
                    .sort((a, b) => b.count - a.count)
                    .map(({ source, count }) => (
                      <ProgressRow
                        key={source}
                        label={SOURCE_LABELS[source] ?? source}
                        count={count}
                        total={totalVisits}
                        color={primaryColor}
                      />
                    ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Dispozitive</h2>
              </div>
              {totalDevices === 0 ? (
                <p className="text-sm text-muted-foreground">Nu exista date</p>
              ) : (
                <div className="space-y-3">
                  {devices
                    .sort((a, b) => b.count - a.count)
                    .map(({ device, count }) => {
                      const labels: Record<string, string> = {
                        mobile: "Mobil", tablet: "Tableta", desktop: "Desktop",
                      };
                      return (
                        <ProgressRow
                          key={device}
                          label={labels[device] ?? device}
                          count={count}
                          total={totalDevices}
                          color={primaryColor}
                        />
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* AOV + Conversion details */}
          {hasOrders && (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground mb-1">Vanzari totale brute</p>
                <p className="text-xl font-bold text-foreground">{formatPrice(metrics.totalRevenue)}</p>
              </div>
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground mb-1">Valoare medie comanda (AOV)</p>
                <p className="text-xl font-bold text-foreground">{formatPrice(metrics.aov)}</p>
              </div>
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground mb-1">Rata conversie</p>
                <p className="text-xl font-bold text-foreground">
                  {metrics.visitsCount > 0 ? `${metrics.conversionRate.toFixed(2)}%` : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {metrics.ordersCount} comenzi / {metrics.visitsCount} vizite
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LIVE TAB ──────────────────────────────────────────────────────── */}
      {tab === "live" && (
        <LiveTab
          businessId={businessId}
          ordersByCounty={ordersByCounty}
          svgContent={svgContent}
          primaryColor={primaryColor}
        />
      )}
    </div>
  );
}
