import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsClient } from "@/components/dashboard/AnalyticsClient";
import { COUNTY_CODE_MAP } from "@/components/dashboard/RomaniaMap";
import fs from "fs";
import path from "path";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

const MONTHS_RO = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function AnalyticsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, primary_color")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const { period: periodParam } = await searchParams;
  const period = periodParam === "7" ? 7 : periodParam === "90" ? 90 : 30;

  const now = Date.now();
  const since = new Date(now - period * 24 * 60 * 60 * 1000).toISOString();
  const prevSince = new Date(now - period * 2 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all data in parallel
  const [eventsRes, ordersRes, prevOrdersRes, allOrdersRes] = await Promise.all([
    supabase
      .from("site_analytics")
      .select("event_type, device, source, created_at")
      .eq("business_id", business.id)
      .gte("created_at", since),

    supabase
      .from("orders")
      .select("total, created_at, status")
      .eq("business_id", business.id)
      .gte("created_at", since),

    // Previous period for trend comparison
    supabase
      .from("orders")
      .select("total, status")
      .eq("business_id", business.id)
      .gte("created_at", prevSince)
      .lt("created_at", since),

    // All-time orders for county map
    supabase
      .from("orders")
      .select("shipping_address, status")
      .eq("business_id", business.id),
  ]);

  const events = eventsRes.data ?? [];
  const orders = ordersRes.data ?? [];
  const prevOrders = prevOrdersRes.data ?? [];
  const allOrders = allOrdersRes.data ?? [];

  const VALID_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered"];

  // Current period metrics
  const validOrders = orders.filter(o => VALID_STATUSES.includes(o.status));
  const totalRevenue = validOrders.reduce((s, o) => s + Number(o.total), 0);
  const ordersCount = validOrders.length;
  const aov = ordersCount > 0 ? totalRevenue / ordersCount : 0;

  const visits = events.filter(e => e.event_type === "visit");
  const visitsCount = visits.length;
  const conversionRate = visitsCount > 0 ? (ordersCount / visitsCount) * 100 : 0;

  // Previous period metrics (for trend)
  const prevValidOrders = prevOrders.filter(o => VALID_STATUSES.includes(o.status));
  const prevRevenue = prevValidOrders.reduce((s, o) => s + Number(o.total), 0);
  const prevOrdersCount = prevValidOrders.length;

  // Daily sales chart data
  const salesByDay = Array.from({ length: period }, (_, i) => {
    const d = new Date(now - (period - 1 - i) * 24 * 60 * 60 * 1000);
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
  visits.forEach(e => {
    const src = e.source ?? "direct";
    sourceMap[src] = (sourceMap[src] ?? 0) + 1;
  });
  const trafficSources = Object.entries(sourceMap).map(([source, count]) => ({ source, count }));

  // Devices
  const deviceMap: Record<string, number> = {};
  events.forEach(e => {
    if (e.device) deviceMap[e.device] = (deviceMap[e.device] ?? 0) + 1;
  });
  const devices = Object.entries(deviceMap).map(([device, count]) => ({ device, count }));

  // Orders by county (all-time, for the map)
  const countyOrderMap: Record<string, number> = {};
  allOrders.forEach(o => {
    if (!VALID_STATUSES.includes(o.status)) return;
    const addr = o.shipping_address as { county?: string } | null;
    if (addr?.county) {
      countyOrderMap[addr.county] = (countyOrderMap[addr.county] ?? 0) + 1;
    }
  });

  const ordersByCounty = Object.entries(COUNTY_CODE_MAP).map(([county, code]) => ({
    county,
    code,
    orders: countyOrderMap[county] ?? 0,
  }));

  // Read SVG from public folder at server render time
  const svgPath = path.join(process.cwd(), "public", "ro.svg");
  const svgContent = fs.readFileSync(svgPath, "utf-8");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AnalyticsClient
        period={period}
        salesByDay={salesByDay}
        metrics={{ totalRevenue, ordersCount, aov, conversionRate, visitsCount, prevRevenue, prevOrdersCount }}
        trafficSources={trafficSources}
        devices={devices}
        ordersByCounty={ordersByCounty}
        businessId={business.id}
        svgContent={svgContent}
        primaryColor={business.primary_color ?? "#1AB554"}
      />
    </div>
  );
}
