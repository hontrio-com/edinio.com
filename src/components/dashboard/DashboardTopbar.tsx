"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Search, Bell, LogOut, ChevronDown, X, Menu,
  LayoutDashboard, Pencil, Package, ShoppingCart, Settings,
  BarChart2, Zap, Ticket, Megaphone, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { logout } from "@/lib/actions/auth.actions";
import { markNotificationsRead } from "@/lib/actions/notification.actions";
import { Logo } from "@/components/ui/Logo";
import { BusinessCard } from "@/components/dashboard/Sidebar";
import { formatPrice } from "@/lib/utils/format";
import { PLAN_LABELS as PLAN_NAMES } from "@/lib/plans";
import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];

type OrderNotif = {
  id: string;
  customer_name: string;
  created_at: string;
  total: number;
};

type PlatformNotif = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panou principal" },
  { href: "/dashboard/editor", icon: Pencil, label: "Editeaza magazinul" },
  { href: "/dashboard/pages", icon: FileText, label: "Pagini" },
  { href: "/dashboard/features", icon: Zap, label: "Integrari" },
  { href: "/dashboard/products", icon: Package, label: "Produse" },
  { href: "/dashboard/orders", icon: ShoppingCart, label: "Comenzi" },
  { href: "/dashboard/discounts", icon: Ticket, label: "Discounturi" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Statistici" },
];

const PLAN_BADGE_STYLES: Record<string, string> = {
  free:    "bg-muted text-muted-foreground",
  basic:   "bg-blue-100 text-blue-700",
  premium: "bg-primary/10 text-primary",
  ultra:   "bg-amber-100 text-amber-700",
};

interface Props {
  userFullName: string;
  plan: string;
  recentOrders: OrderNotif[];
  notifications: PlatformNotif[];
  currentBusiness: Business | null;
}

export function DashboardTopbar({ userFullName, plan, recentOrders, notifications, currentBusiness }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [readOrderIds, setReadOrderIds] = useState<Set<string>>(new Set());
  const [notifTab, setNotifTab] = useState<"all" | "orders" | "platform">("all");
  const [, startMarkRead] = useTransition();

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const planLabel = PLAN_NAMES[plan] ?? plan;
  const planCls = PLAN_BADGE_STYLES[plan] ?? PLAN_BADGE_STYLES.free;
  const initials = userFullName?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "U";

  // Load read order IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("edinio_read_notifs");
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        const currentIds = new Set(recentOrders.map(o => o.id));
        const cleaned = parsed.filter(id => currentIds.has(id));
        setReadOrderIds(new Set(cleaned));
        if (cleaned.length !== parsed.length) {
          localStorage.setItem("edinio_read_notifs", JSON.stringify(cleaned));
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Sync search input with URL param
  useEffect(() => {
    const urlSearch = searchParams.get("search") ?? "";
    setSearch(urlSearch);
  }, [searchParams]);

  const unreadOrderCount = recentOrders.filter(o => !readOrderIds.has(o.id)).length;
  const unreadPlatformCount = notifications.filter(n => !n.is_read).length;
  const totalUnread = unreadOrderCount + unreadPlatformCount;

  // Build unified notification list
  type UnifiedNotif = { id: string; kind: "order" | "platform"; title: string; subtitle: string; created_at: string; isUnread: boolean; href?: string; notifData?: PlatformNotif };
  const allNotifs: UnifiedNotif[] = [
    ...recentOrders.map(o => ({
      id: o.id,
      kind: "order" as const,
      title: `Comanda noua de la ${o.customer_name}`,
      subtitle: formatPrice(o.total),
      created_at: o.created_at,
      isUnread: !readOrderIds.has(o.id),
      href: `/dashboard/orders/${o.id}`,
    })),
    ...notifications.map(n => ({
      id: n.id,
      kind: "platform" as const,
      title: n.title,
      subtitle: n.message.length > 80 ? n.message.slice(0, 80) + "..." : n.message,
      created_at: n.created_at,
      isUnread: !n.is_read,
      notifData: n,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filteredNotifs = notifTab === "all" ? allNotifs : notifTab === "orders" ? allNotifs.filter(n => n.kind === "order") : allNotifs.filter(n => n.kind === "platform");

  function markAllRead() {
    // Mark orders
    const newIds = new Set([...readOrderIds, ...recentOrders.map(o => o.id)]);
    setReadOrderIds(newIds);
    try { localStorage.setItem("edinio_read_notifs", JSON.stringify([...newIds])); } catch {}
    // Mark platform notifications
    const unreadPlatformIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadPlatformIds.length > 0) {
      startMarkRead(async () => { await markNotificationsRead(unreadPlatformIds); router.refresh(); });
    }
  }

  function formatTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "acum";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}z`;
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/dashboard/products?search=${encodeURIComponent(search.trim())}`);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 h-14 bg-background/95 backdrop-blur-sm border-b border-border flex items-center gap-3 px-4 lg:px-5">

        {/* Mobile: hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent transition-colors"
          aria-label="Deschide meniu"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>

        {/* Search bar — always visible */}
        <form onSubmit={handleSearch} className="flex flex-1 max-w-sm lg:max-w-sm relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cauta produse, comenzi..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          />
        </form>

        {/* Right side: bell + user */}
        <div className="flex items-center gap-1 ml-auto">

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => { setNotifOpen(v => !v); setUserOpen(false); }}
            className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
            aria-label="Notificari"
          >
            <Bell className="h-4.5 w-4.5 text-muted-foreground" />
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {totalUnread > 9 ? "9+" : totalUnread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="fixed inset-x-4 top-[3.75rem] sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-w-sm bg-popover border border-border rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[500px]">
              {/* Header */}
              <div className="px-5 py-4 border-b border-border flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">Notificari</p>
                    {totalUnread > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                        {totalUnread} noi
                      </span>
                    )}
                  </div>
                  {totalUnread > 0 && (
                    <button type="button" onClick={markAllRead}
                      className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
                      Marcheaza ca citite
                    </button>
                  )}
                </div>
                {allNotifs.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {(["all", "orders", "platform"] as const).map(tab => {
                      const labels = { all: "Toate", orders: "Comenzi", platform: "Anunturi" };
                      return (
                        <button key={tab} type="button" onClick={() => setNotifTab(tab)}
                          className={cn(
                            "flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors",
                            notifTab === tab ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                          )}>
                          {labels[tab]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* List */}
              <div className="overflow-y-auto flex-1">
                {filteredNotifs.length > 0 ? (
                  filteredNotifs.map(notif => {
                    const isOrder = notif.kind === "order";
                    return isOrder ? (
                      <Link key={notif.id} href={notif.href!}
                        onClick={() => {
                          setNotifOpen(false);
                          const newIds = new Set([...readOrderIds, notif.id]);
                          setReadOrderIds(newIds);
                          try { localStorage.setItem("edinio_read_notifs", JSON.stringify([...newIds])); } catch {}
                        }}
                        className="flex items-start gap-3.5 px-5 py-3.5 hover:bg-accent transition-colors border-b border-border/50 last:border-0">
                        <div className="flex-shrink-0 mt-1.5">
                          {notif.isUnread ? <span className="block w-2 h-2 rounded-full bg-primary" /> : <span className="block w-2 h-2 rounded-full bg-transparent" />}
                        </div>
                        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0", notif.isUnread ? "bg-amber-100" : "bg-muted")}>
                          <ShoppingCart className={cn("h-4 w-4", notif.isUnread ? "text-amber-600" : "text-muted-foreground")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm leading-snug", notif.isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{notif.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-foreground">{notif.subtitle}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{formatTimeAgo(notif.created_at)}</span>
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <div key={notif.id}
                        onClick={() => {
                          if (notif.isUnread && notif.notifData) {
                            startMarkRead(async () => { await markNotificationsRead([notif.id]); router.refresh(); });
                          }
                        }}
                        className="flex items-start gap-3.5 px-5 py-3.5 hover:bg-accent transition-colors border-b border-border/50 last:border-0 cursor-default">
                        <div className="flex-shrink-0 mt-1.5">
                          {notif.isUnread ? <span className="block w-2 h-2 rounded-full bg-primary" /> : <span className="block w-2 h-2 rounded-full bg-transparent" />}
                        </div>
                        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0", notif.isUnread ? "bg-blue-100" : "bg-muted")}>
                          <Megaphone className={cn("h-4 w-4", notif.isUnread ? "text-blue-600" : "text-muted-foreground")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm leading-snug", notif.isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{notif.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.subtitle}</p>
                          <span className="text-xs text-muted-foreground mt-1 block">{formatTimeAgo(notif.created_at)}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-5 py-12 text-center">
                    <Bell className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">Nicio notificare</p>
                    <p className="text-xs text-muted-foreground">Comenzile si anunturile vor aparea aici</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              {recentOrders.length > 0 && (
                <div className="px-5 py-3 border-t border-border flex-shrink-0 bg-muted/30">
                  <Link href="/dashboard/orders" onClick={() => setNotifOpen(false)}
                    className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                    Vezi toate comenzile
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => { setUserOpen(v => !v); setNotifOpen(false); }}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <span className="hidden lg:block text-sm font-medium text-foreground truncate max-w-[120px]">{userFullName || "Contul meu"}</span>
            <ChevronDown className={cn("hidden lg:block h-3.5 w-3.5 text-muted-foreground transition-transform", userOpen && "rotate-180")} />
          </button>

          {userOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground truncate">{userFullName || "Contul meu"}</p>
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold mt-1", planCls)}>
                  {planLabel}
                </span>
              </div>
              <Link href="/dashboard/settings" onClick={() => setUserOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <Settings className="h-4 w-4" />
                Setari cont
              </Link>
              <div className="border-t border-border">
                <form action={logout}>
                  <button type="submit" className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors">
                    <LogOut className="h-4 w-4" />
                    Deconecteaza-te
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        </div>{/* end right side */}
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        </div>
      )}

      {/* Mobile drawer */}
      <div className={cn(
        "lg:hidden fixed inset-y-0 left-0 w-72 bg-sidebar border-r border-sidebar-border z-50 flex flex-col transition-transform duration-300",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          <Logo size="sm" href="/dashboard" />
          <button type="button" onClick={() => setMobileOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
            <X className="h-4.5 w-4.5 text-muted-foreground" />
          </button>
        </div>

        {/* Business info */}
        <div className="px-3 py-3 border-b border-sidebar-border">
          <BusinessCard business={currentBusiness} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Upgrade banner (free plan) */}
        {plan === "free" && (
          <div className="mx-3 mb-3 p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="text-xs font-semibold text-foreground">Plan Gratuit</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
              Upgrade la Pro pentru functii avansate, fara comisioane si suport prioritar.
            </p>
            <Link href="/dashboard/settings#abonament"
              className="block text-center text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg py-1.5 transition-colors">
              Upgrade acum
            </Link>
          </div>
        )}

        {/* Settings */}
        <div className="px-3 pb-2">
          <Link
            href="/dashboard/settings"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              pathname.startsWith("/dashboard/settings")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            Setari
          </Link>
        </div>

        {/* User */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className="flex items-center justify-between px-2 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                {initials}
              </div>
              <span className="text-xs font-medium text-foreground truncate">{userFullName || "Contul meu"}</span>
            </div>
            <form action={logout}>
              <button type="submit" className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Deconecteaza-te">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
