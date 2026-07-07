import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ShoppingCart, Wallet, Package, Clock, AlertCircle, Megaphone,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getLatestAnnouncement } from "@/lib/actions/announcement.actions";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Callout } from "@/components/ui/callout";
import { orderStatus } from "@/lib/orders/status";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { AnnouncementArticle } from "@/components/dashboard/AnnouncementArticle";
import type { Announcement } from "@/lib/announcements";

// Sanitize text-block HTML before it reaches the client renderer.
function announcementToArticle(a: Announcement) {
  return {
    title: a.title,
    excerpt: a.excerpt,
    cover_url: a.cover_url,
    is_pinned: a.is_pinned,
    published_at: a.published_at,
    blocks: (Array.isArray(a.blocks) ? a.blocks : []).map((b) =>
      b.type === "text" ? { ...b, html: sanitizeHtml(b.html) } : b
    ),
  };
}
import { SiteStatusBar } from "@/components/dashboard/SiteStatusBar";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import type { ChartDay } from "@/components/dashboard/RevenueChart";

type StatCardProps = {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaDir?: "up" | "down";
  deltaCaption?: string;
  href: string;
  icon: LucideIcon;
  empty?: boolean;
};

function StatCard({
  label,
  value,
  unit,
  delta,
  deltaDir = "up",
  deltaCaption = "vs. ieri",
  href,
  icon: Icon,
  empty = false,
}: StatCardProps) {
  return (
    <Link
      href={href}
      className={[
        "group relative flex flex-col overflow-hidden rounded-xl bg-surface",
        "shadow-[0_1px_2px_rgba(15,23,20,0.04)]",
        "border border-border transition-all duration-200",
        "hover:-translate-y-0.5",
        "hover:shadow-[0_1px_2px_rgba(15,23,20,0.04),0_18px_32px_-20px_rgba(15,23,20,0.12)]",
        "min-h-[168px] no-underline",
      ].join(" ")}
    >
      {/* top — label + icon */}
      <div className="flex items-center justify-between border-b border-dashed border-border px-[18px] py-[14px]">
        <span className="text-[12px] font-medium text-muted-foreground tracking-[0.01em]">
          {label}
        </span>
        <span className="grid h-7 w-7 place-items-center text-muted-foreground">
          <Icon strokeWidth={1.4} className="h-[15px] w-[15px]" />
        </span>
      </div>

      {/* bottom — value + footer */}
      <div className="flex flex-1 flex-col justify-between px-[18px] pt-4 pb-[18px]">
        <div
          className={cn(
            "text-[44px] leading-none font-medium tracking-[-0.03em] tabular-nums",
            empty ? "text-muted-foreground/30" : "text-foreground"
          )}
        >
          {value}
          {unit && (
            <span className="ml-1 text-[20px] font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </div>

        <div className="mt-[14px] flex items-center gap-2 text-[12px] text-muted-foreground">
          {!empty && delta ? (
            <>
              <span className={cn(
                "font-medium tabular-nums",
                deltaDir === "down" ? "text-destructive" : "text-primary"
              )}>
                {deltaDir === "up" ? "↑" : "↓"} {delta}
              </span>
              <span>{deltaCaption}</span>
            </>
          ) : (
            <span>Actualizat acum</span>
          )}

          <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            Vezi detalii
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-[3px]">
              →
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, business_name, is_published")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!business) redirect("/onboarding/details");

  const now = new Date();
  const today     = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const lastMonthEnd   = thisMonthStart;

  const sevenDaysAgo = new Date(now.getTime() - 6 * 86400000).toISOString().split("T")[0];

  const publicUrl = business.custom_domain
    ? `https://${business.custom_domain}`
    : `${process.env.NEXT_PUBLIC_SITE_URL}/${business.slug}`;

  // Vanzarile nu includ comenzile anulate/rambursate — aceeasi regula ca in
  // Analytics (VALID_STATUSES) si paginile de admin. Lista "Comenzi recente"
  // ramane nefiltrata (e un jurnal, nu o metrica).
  const NOT_SALES = "(cancelled,refunded)";

  const [
    { count: ordersToday },
    { count: ordersYesterday },
    { data: ordersMonth },
    { data: ordersLastMonth },
    { count: activeProducts },
    { count: pendingOrders },
    { data: recentOrders },
    { data: last7DaysOrders },
    { data: lowStockProducts },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("business_id", business.id).not("status", "in", NOT_SALES).gte("created_at", today),
    supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("business_id", business.id).not("status", "in", NOT_SALES).gte("created_at", yesterday).lt("created_at", today),
    supabase.from("orders").select("total")
      .eq("business_id", business.id).not("status", "in", NOT_SALES).gte("created_at", thisMonthStart),
    supabase.from("orders").select("total")
      .eq("business_id", business.id).not("status", "in", NOT_SALES).gte("created_at", lastMonthStart).lt("created_at", lastMonthEnd),
    supabase.from("products").select("*", { count: "exact", head: true })
      .eq("business_id", business.id).eq("is_active", true),
    supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("business_id", business.id).eq("status", "pending"),
    supabase.from("orders").select("id, order_number, customer_name, total, status, created_at")
      .eq("business_id", business.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("orders").select("created_at, total")
      .eq("business_id", business.id).not("status", "in", NOT_SALES).gte("created_at", sevenDaysAgo).order("created_at", { ascending: true }),
    supabase.from("products").select("id, name, stock_quantity")
      .eq("business_id", business.id).eq("is_active", true)
      .eq("track_inventory", true).lte("stock_quantity", 5)
      .order("stock_quantity", { ascending: true }).limit(5),
  ]);

  const fmt = (n: number) => new Intl.NumberFormat("ro-RO").format(n);
  const fmtDelta = (pct: number) => `${Math.abs(pct)}%`;

  const monthRevenue     = (ordersMonth ?? []).reduce((s, o) => s + Number(o.total), 0);
  const lastMonthRevenue = (ordersLastMonth ?? []).reduce((s, o) => s + Number(o.total), 0);
  const revenuePct = lastMonthRevenue > 0
    ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    : null;

  const ordersTodayCount     = ordersToday ?? 0;
  const ordersYesterdayCount = ordersYesterday ?? 0;
  const ordersPct = ordersYesterdayCount > 0
    ? Math.round(((ordersTodayCount - ordersYesterdayCount) / ordersYesterdayCount) * 100)
    : null;

  // Build 7-day chart data
  const chartData: ChartDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const dayOrders = (last7DaysOrders ?? []).filter(o => o.created_at.startsWith(dateStr));
    return {
      label: d.toLocaleDateString("ro-RO", { weekday: "short", day: "numeric" }),
      revenue: dayOrders.reduce((s, o) => s + Number(o.total), 0),
      orders: dayOrders.length,
    };
  });

  const latestAnnouncement = await getLatestAnnouncement().catch(() => null);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SiteStatusBar
        isPublished={business.is_published}
        businessId={business.id}
        publicUrl={publicUrl}
      />

      {/* Low stock alert */}
      {(lowStockProducts ?? []).length > 0 && (
        <Callout
          variant="danger"
          icon={AlertCircle}
          title="Stoc scazut"
          className="mt-4"
          action={
            <Link href="/dashboard/products" className="text-xs font-semibold text-destructive hover:underline">
              Gestioneaza
            </Link>
          }
        >
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {(lowStockProducts ?? []).map(p => (
              <span key={p.id} className="text-xs">
                {p.name} - <strong>{p.stock_quantity ?? 0} buc</strong>
              </span>
            ))}
          </div>
        </Callout>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
        <StatCard
          label="Comenzi azi"
          value={fmt(ordersTodayCount)}
          delta={ordersPct !== null ? fmtDelta(ordersPct) : undefined}
          deltaDir={ordersPct !== null && ordersPct >= 0 ? "up" : "down"}
          deltaCaption="vs. ieri"
          href="/dashboard/orders"
          icon={ShoppingCart}
          empty={ordersTodayCount === 0}
        />
        <StatCard
          label="Vanzari luna aceasta"
          value={fmt(monthRevenue)}
          unit="lei"
          delta={revenuePct !== null ? fmtDelta(revenuePct) : undefined}
          deltaDir={revenuePct !== null && revenuePct >= 0 ? "up" : "down"}
          deltaCaption="vs. luna trecuta"
          href="/dashboard/orders"
          icon={Wallet}
          empty={monthRevenue === 0}
        />
        <StatCard
          label="Produse active"
          value={fmt(activeProducts ?? 0)}
          href="/dashboard/products"
          icon={Package}
          empty={(activeProducts ?? 0) === 0}
        />
        <StatCard
          label="In asteptare"
          value={fmt(pendingOrders ?? 0)}
          href="/dashboard/orders?status=pending"
          icon={Clock}
          empty={(pendingOrders ?? 0) === 0}
        />
      </div>

      {/* Chart + recent orders */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">Vanzari - ultimele 7 zile</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{formatPrice(chartData.reduce((s, d) => s + d.revenue, 0))} total</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {chartData.reduce((s, d) => s + d.orders, 0)} comenzi
            </span>
          </div>
          <div className="px-5 py-5">
            <RevenueChart data={chartData} />
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Comenzi recente</h2>
            <Link href="/dashboard/orders" className="text-xs text-primary hover:underline font-medium">
              Vezi toate
            </Link>
          </div>
          {(recentOrders ?? []).length > 0 ? (
            <div className="divide-y divide-border">
              {(recentOrders ?? []).map(order => {
                const status = orderStatus(order.status);
                return (
                  <Link
                    key={order.id}
                    href={`/dashboard/orders/${order.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground font-mono">{order.order_number}</div>
                      <div className="text-xs text-muted-foreground truncate">{order.customer_name}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-3">
                      <span className="text-sm font-semibold text-foreground">{formatPrice(Number(order.total))}</span>
                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold", status.className)}>
                        {status.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <ShoppingCart className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Nu exista comenzi inca</p>
            </div>
          )}
        </div>
      </div>

      {latestAnnouncement && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Noutati</h2>
          </div>
          <AnnouncementArticle data={announcementToArticle(latestAnnouncement)} />
        </div>
      )}
    </div>
  );
}
