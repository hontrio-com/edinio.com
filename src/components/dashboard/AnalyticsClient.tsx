"use client";

import { useState, useEffect, useCallback } from "react";
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
import { RomaniaMap, COUNTY_CODE_MAP } from "@/components/dashboard/RomaniaMap";
import { createClient } from "@/lib/supabase/client";

const MONTHS_RO = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const VALID_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered"];

interface DayData { date: string; label: string; revenue: number; orders: number }
interface Metrics {
  totalRevenue: number; ordersCount: number; aov: number;
  conversionRate: number; visitsCount: number;
  prevRevenue: number; prevOrdersCount: number;
}
interface SourceEntry { source: string; count: number }
interface DeviceEntry { device: string; count: number }
interface CountyEntry { county: string; code: string; orders: number }

interface AnalyticsData {
  salesByDay: DayData[];
  metrics: Metrics;
  trafficSources: SourceEntry[];
  devices: DeviceEntry[];
  ordersByCounty: CountyEntry[];
}

interface Props {
  businessId: string;
  svgContent: string;
  primaryColor: string;
}

const PERIOD_OPTIONS = [
  { value: 7, label: "7 zile" },
  { value: 30, label: "30 zile" },
  { value: 90, label: "90 zile" },
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

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      <p className="text-gray-500">Vanzari: <span className="font-bold text-gray-900">{formatPrice(payload[0]?.value ?? 0)}</span></p>
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

function StatSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-muted" />
      </div>
      <div className="h-7 w-24 bg-muted rounded-lg mb-2" />
      <div className="h-3 w-16 bg-muted rounded" />
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
export function AnalyticsClient({ businessId, svgContent, primaryColor }: Props) {
  const [period, setPeriod] = useState(30);
  const [tab, setTab] = useState<"overview" | "live">("overview");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const fetchAnalytics = useCallback(async (p: number) => {
    setLoading(true);
    const supabase = createClient();
    const now = Date.now();
    const since = new Date(now - p * 86400000).toISOString();
    const prevSince = new Date(now - p * 2 * 86400000).toISOString();

    const [eventsRes, ordersRes, prevOrdersRes, allOrdersRes] = await Promise.all([
      supabase.from("site_analytics")
        .select("event_type, device, source, created_at")
        .eq("business_id", businessId)
        .gte("created_at", since),
      supabase.from("orders")
        .select("total, created_at, status")
        .eq("business_id", businessId)
        .gte("created_at", since),
      supabase.from("orders")
        .select("total, status")
        .eq("business_id", businessId)
        .gte("created_at", prevSince)
        .lt("created_at", since),
      supabase.from("orders")
        .select("shipping_address, status")
        .eq("business_id", businessId),
    ]);

    const events = eventsRes.data ?? [];
    const orders = ordersRes.data ?? [];
    const prevOrders = prevOrdersRes.data ?? [];
    const allOrders = allOrdersRes.data ?? [];

    // Metrics
    const validOrders = orders.filter(o => VALID_STATUSES.includes(o.status));
    const totalRevenue = validOrders.reduce((s, o) => s + Number(o.total), 0);
    const ordersCount = validOrders.length;
    const aov = ordersCount > 0 ? totalRevenue / ordersCount : 0;
    const visits = events.filter(e => e.event_type === "visit");
    const visitsCount = visits.length;
    const conversionRate = visitsCount > 0 ? (ordersCount / visitsCount) * 100 : 0;
    const prevValidOrders = prevOrders.filter(o => VALID_STATUSES.includes(o.status));
    const prevRevenue = prevValidOrders.reduce((s, o) => s + Number(o.total), 0);
    const prevOrdersCount = prevValidOrders.length;

    // Daily sales
    const salesByDay: DayData[] = Array.from({ length: p }, (_, i) => {
      const d = new Date(now - (p - 1 - i) * 86400000);
      d.setHours(0, 0, 0, 0);
      const dayStr = d.toISOString().slice(0, 10);
      const dayOrders = validOrders.filter(o => o.created_at.slice(0, 10) === dayStr);
      return {
        date: dayStr,
        label: `${d.getDate()} ${MONTHS_RO[d.getMonth()]}`,
        revenue: Math.round(dayOrders.reduce((s, o) => s + Number(o.total), 0)),
        orders: dayOrders.length,
      };
    });

    // Traffic sources
    const sourceMap: Record<string, number> = {};
    visits.forEach(e => { sourceMap[e.source ?? "direct"] = (sourceMap[e.source ?? "direct"] ?? 0) + 1; });
    const trafficSources = Object.entries(sourceMap).map(([source, count]) => ({ source, count }));

    // Devices
    const deviceMap: Record<string, number> = {};
    events.forEach(e => { if (e.device) deviceMap[e.device] = (deviceMap[e.device] ?? 0) + 1; });
    const devices = Object.entries(deviceMap).map(([device, count]) => ({ device, count }));

    // County orders
    const countyOrderMap: Record<string, number> = {};
    allOrders.forEach(o => {
      if (!VALID_STATUSES.includes(o.status)) return;
      const addr = o.shipping_address as { county?: string } | null;
      if (addr?.county) countyOrderMap[addr.county] = (countyOrderMap[addr.county] ?? 0) + 1;
    });
    const ordersByCounty: CountyEntry[] = Object.entries(COUNTY_CODE_MAP).map(([county, code]) => ({
      county, code, orders: countyOrderMap[county] ?? 0,
    }));

    setData({
      salesByDay,
      metrics: { totalRevenue, ordersCount, aov, conversionRate, visitsCount, prevRevenue, prevOrdersCount },
      trafficSources,
      devices,
      ordersByCounty,
    });
    setLoading(false);
  }, [businessId]);

  useEffect(() => { fetchAnalytics(period); }, [period, fetchAnalytics]);

  const totalVisits = data?.trafficSources.reduce((s, x) => s + x.count, 0) ?? 0;
  const totalDevices = data?.devices.reduce((s, x) => s + x.count, 0) ?? 0;
  const revenueTrend = data ? pct(data.metrics.totalRevenue, data.metrics.prevRevenue) : null;
  const ordersTrend = data ? pct(data.metrics.ordersCount, data.metrics.prevOrdersCount) : null;
  const hasOrders = (data?.metrics.ordersCount ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Statistici</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Performanta magazinului tau</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-muted rounded-xl p-1 gap-0.5 flex-1 sm:flex-none">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  "flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  period === opt.value
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Tab switcher */}
          <div className="flex bg-muted rounded-xl p-1 gap-0.5 flex-1 sm:flex-none">
            <button
              type="button"
              onClick={() => setTab("overview")}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
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
                "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
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
          {loading || !data ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label={`Vanzari (${period} zile)`}
                value={formatPrice(data.metrics.totalRevenue)}
                trend={revenueTrend}
                icon={BadgeDollarSign}
                color="bg-green-50 text-green-600"
              />
              <StatCard
                label="Comenzi"
                value={String(data.metrics.ordersCount)}
                sub={`vs ${data.metrics.prevOrdersCount} perioada anterioara`}
                trend={ordersTrend}
                icon={ShoppingCart}
                color="bg-blue-50 text-blue-600"
              />
              <StatCard
                label="Valoare medie comanda"
                value={hasOrders ? formatPrice(data.metrics.aov) : "-"}
                icon={TrendingUp}
                color="bg-purple-50 text-purple-600"
              />
              <StatCard
                label="Rata de conversie"
                value={data.metrics.visitsCount > 0 ? `${data.metrics.conversionRate.toFixed(1)}%` : "-"}
                sub={`${data.metrics.visitsCount} vizite`}
                icon={Eye}
                color="bg-amber-50 text-amber-600"
              />
            </div>
          )}

          {/* Sales chart */}
          <div className="bg-white border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Vanzari zilnice - ultimele {period} zile
            </h2>
            {!mounted || loading || !data ? (
              <div className="h-56 bg-muted animate-pulse rounded-xl" />
            ) : !hasOrders ? (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                Nu exista vanzari in aceasta perioada
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.salesByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
          {loading || !data ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-muted rounded-xl h-48 animate-pulse" />
              <div className="bg-muted rounded-xl h-48 animate-pulse" />
            </div>
          ) : (
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
                    {data.trafficSources
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
                    {data.devices
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
          )}

          {/* AOV + Conversion details */}
          {!loading && data && hasOrders && (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground mb-1">Vanzari totale brute</p>
                <p className="text-xl font-bold text-foreground">{formatPrice(data.metrics.totalRevenue)}</p>
              </div>
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground mb-1">Valoare medie comanda (AOV)</p>
                <p className="text-xl font-bold text-foreground">{formatPrice(data.metrics.aov)}</p>
              </div>
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground mb-1">Rata conversie</p>
                <p className="text-xl font-bold text-foreground">
                  {data.metrics.visitsCount > 0 ? `${data.metrics.conversionRate.toFixed(2)}%` : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.metrics.ordersCount} comenzi / {data.metrics.visitsCount} vizite
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
          ordersByCounty={data?.ordersByCounty ?? []}
          svgContent={svgContent}
          primaryColor={primaryColor}
        />
      )}
    </div>
  );
}
