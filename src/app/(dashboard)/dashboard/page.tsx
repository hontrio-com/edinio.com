import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  ShoppingCart, Wallet, Package, Clock, Megaphone,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getLatestAnnouncement } from "@/lib/actions/announcement.actions";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { StocScazutRand } from "@/components/dashboard/StocScazutRand";
import { PRAG_STOC_SCAZUT } from "@/lib/stoc-prag";
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
import { PanouVanzari } from "@/components/dashboard/PanouVanzari";
import { citesteDateVanzari } from "@/lib/vanzari";
import { ActivationChecklist, type ChecklistStep } from "@/components/dashboard/ActivationChecklist";

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

  // `custom_domain_healthy` intra in select fiindca bara de stare nu are voie sa
  // dea verde pe un domeniu dovedit mort. `null` inseamna doar „neverificat".
  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, custom_domain_healthy, business_name, is_published, logo_url")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!business) redirect("/onboarding/details");

  // Adresa de platforma ramane calculata separat: e ce oferim cand domeniul
  // propriu nu raspunde, si acolo magazinul chiar se deschide.
  // Rezerva nu e cosmetica: pe calea de avarie asta devine linkul ANCORAT si
  // COPIAT de comerciant, deci un `undefined` s-ar duce la clienti prin clipboard.
  const platformUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com"}/${business.slug}`;
  const publicUrl = business.custom_domain
    ? `https://${business.custom_domain}`
    : platformUrl;

  /*
   * Bara de stare pleaca IMEDIAT; cifrele curg dupa ea.
   *
   * Panoul facea noua interogari inainte sa trimita ceva catre browser, iar
   * `loading.tsx` tinea toata pagina gri pana se termina si cea mai lenta. Dar
   * lucrul cel mai cerut de aici — daca magazinul e publicat si adresa lui — se
   * stie dupa PRIMA interogare.
   *
   * Asa, comerciantul vede bara de stare si isi poate deschide magazinul cat
   * timp statisticile inca se aduna.
   */
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SiteStatusBar
        isPublished={business.is_published}
        businessId={business.id}
        publicUrl={publicUrl}
        platformUrl={platformUrl}
        customDomain={business.custom_domain}
        domainHealthy={business.custom_domain_healthy}
      />
      <Suspense fallback={<ScheletPanou />}>
        <ContinutPanou business={business} userId={user.id} publicUrl={publicUrl} />
      </Suspense>
    </div>
  );
}

function ScheletPanou() {
  return (
    <div className="mt-6 space-y-6">
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

type BusinessPanou = {
  id: string; slug: string; custom_domain: string | null;
  business_name: string; is_published: boolean; logo_url: string | null;
};

async function ContinutPanou({
  business, userId, publicUrl,
}: { business: BusinessPanou; userId: string; publicUrl: string }) {
  const supabase = await createClient();
  const now = new Date();
  const today     = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const lastMonthEnd   = thisMonthStart;



  // Vanzarile nu includ comenzile anulate/rambursate — aceeasi regula ca in
  // Analytics (VALID_STATUSES) si paginile de admin. Lista "Comenzi recente"
  // ramane nefiltrata (e un jurnal, nu o metrica).
  const NOT_SALES = "(cancelled,refunded)";

  const [
    { count: ordersToday },
    { count: ordersYesterday },
    { data: monthRevenueRpc },
    { data: lastMonthRevenueRpc },
    { count: activeProducts },
    { count: pendingOrders },
    { data: recentOrders },
    { data: vanzariRpc },
    { data: canaleVanzare },
    { data: numaratoareStoc },
    { count: productsTotal },
    { count: ordersTotal },
    { data: dashProfile },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("business_id", business.id).not("status", "in", NOT_SALES).gte("created_at", today),
    supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("business_id", business.id).not("status", "in", NOT_SALES).gte("created_at", yesterday).lt("created_at", today),
    // Sumele de venit se calculeaza in SQL (nu din randuri aduse in JS):
    // PostgREST trunchiaza orice raspuns la 1000 de randuri, deci reduce-ul
    // in JS subestima veniturile la magazinele cu volum mare.
    supabase.rpc("orders_revenue_sum", { bid: business.id, t_from: thisMonthStart }),
    supabase.rpc("orders_revenue_sum", { bid: business.id, t_from: lastMonthStart, t_to: lastMonthEnd }),
    supabase.from("products").select("*", { count: "exact", head: true })
      .eq("business_id", business.id).eq("is_active", true),
    supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("business_id", business.id).eq("status", "pending"),
    supabase.from("orders").select("id, order_number, customer_name, total, status, created_at")
      .eq("business_id", business.id).order("created_at", { ascending: false }).limit(5),
    /*
      Prima fereastra a graficului de vanzari (ultimele 7 zile, toate canalele),
      adusa de pe server ca panoul sa nu porneasca gol. Restul perioadelor le
      cere componenta, din browser.

      ⚠ Ziua e cea ROMANEASCA, taiata in SQL. Graficul de pana acum folosea
      `orders_daily_revenue`, care grupeaza pe ziua UTC: vara, o comanda de la
      01:30 se vedea in ziua precedenta.
    */
    supabase.rpc("vanzari_panou", { p_business: business.id, p_fel: "7z" }),
    supabase.rpc("canale_vanzare", { p_business: business.id }),
    /*
      Cate produse sunt sub prag si cate s-au oprit din vanzare. Numaratoarea se
      face IN BAZA, fiindca trebuie sa se uite si in variante: un produs cu 17
      bucati in total poate avea o varianta pe zero (vezi `produse_sub_prag`).
      Un filtru pe `stock_quantity` ar fi sarit exact peste acelea.
    */
    supabase.rpc("numar_produse_sub_prag", { p_business: business.id, p_prag: PRAG_STOC_SCAZUT }),
    // ── Semnale pentru checklist-ul de activare ──
    supabase.from("products").select("*", { count: "exact", head: true })
      .eq("business_id", business.id),
    supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("business_id", business.id),
    supabase.from("users_profile").select("plan, plan_expires_at").eq("id", userId).maybeSingle(),
  ]);

  const fmt = (n: number) => new Intl.NumberFormat("ro-RO").format(n);
  const fmtDelta = (pct: number) => `${Math.abs(pct)}%`;

  const monthRevenue     = Number(monthRevenueRpc ?? 0);
  const lastMonthRevenue = Number(lastMonthRevenueRpc ?? 0);
  const revenuePct = lastMonthRevenue > 0
    ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    : null;

  const ordersTodayCount     = ordersToday ?? 0;
  const ordersYesterdayCount = ordersYesterday ?? 0;
  const ordersPct = ordersYesterdayCount > 0
    ? Math.round(((ordersTodayCount - ordersYesterdayCount) / ordersYesterdayCount) * 100)
    : null;

  const dateVanzari = citesteDateVanzari(vanzariRpc);

  const latestAnnouncement = await getLatestAnnouncement().catch(() => null);

  // ── Checklist de activare: semnale calculate server-side ──
  // Pasul "customize" e bifat de logo (semnal server) SAU de vizitarea paginii de
  // editare, marcata client-side in ActivationChecklist (vezi customizeVisitedKey).
  const activationSteps: ChecklistStep[] = [
    { id: "product", title: "Adauga primul produs", description: "Fara produse, clientii nu au ce cumpara.", done: (productsTotal ?? 0) > 0, href: "/dashboard/products/new", cta: "Adauga" },
    { id: "customize", title: "Personalizeaza magazinul", description: "Adauga logo, culori si detaliile magazinului tau.", done: !!business.logo_url, href: "/dashboard/editor", cta: "Personalizeaza" },
    { id: "publish", title: "Publica magazinul", description: "Fa magazinul vizibil pentru clientii tai.", done: business.is_published, href: "/dashboard/editor", cta: "Publica" },
    { id: "order", title: "Primeste prima comanda", description: "Distribuie link-ul pe WhatsApp si retele sociale.", done: (ordersTotal ?? 0) > 0, share: true, cta: "Distribuie" },
  ];

  return (
    <>

      <ActivationChecklist
        steps={activationSteps}
        plan={dashProfile?.plan ?? "free"}
        planExpiresAt={dashProfile?.plan_expires_at ?? null}
        publicUrl={publicUrl}
      />

      <StocScazutRand
        businessId={business.id}
        epuizate={numaratoareStoc?.[0]?.epuizate ?? 0}
        subPrag={numaratoareStoc?.[0]?.sub_prag ?? 0}
      />

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
        {/* Graficul de vanzari: perioade, canale, comparatie (vezi PanouVanzari) */}
        {dateVanzari ? (
          <PanouVanzari
            businessId={business.id}
            initial={dateVanzari}
            canale={(canaleVanzare ?? []).map((c) => ({ canal: c.canal, comenzi: Number(c.comenzi) }))}
          />
        ) : (
          /* Functia din baza n-a raspuns. Panoul nu cade pentru atat: locul
             graficului ramane, cu un rand care spune ce s-a intamplat. */
          <div className="lg:col-span-2 flex items-center justify-center rounded-xl bg-card px-5 py-16 text-sm text-muted-foreground ring-1 ring-foreground/10">
            Graficul de vanzari nu a putut fi incarcat.
          </div>
        )}

        {/* Recent orders */}
        <div className="bg-card ring-1 ring-foreground/10 rounded-xl overflow-hidden">
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
    </>
  );
}
