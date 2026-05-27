"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search, Bell, LogOut, ChevronDown, X, Menu,
  LayoutDashboard, Pencil, Package, ShoppingCart, Settings,
  BarChart2, Zap, Plus, Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { logout } from "@/lib/actions/auth.actions";
import { formatPrice } from "@/lib/utils/format";
import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];

type OrderNotif = {
  id: string;
  customer_name: string;
  created_at: string;
  total: number;
};

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panou principal" },
  { href: "/dashboard/editor", icon: Pencil, label: "Editeaza magazinul" },
  { href: "/dashboard/features", icon: Zap, label: "Functii" },
  { href: "/dashboard/products", icon: Package, label: "Produse" },
  { href: "/dashboard/orders", icon: ShoppingCart, label: "Comenzi" },
  { href: "/dashboard/discounts", icon: Ticket, label: "Discounturi" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Statistici" },
];

const PLAN_LABELS: Record<string, { label: string; cls: string }> = {
  free:     { label: "Gratuit",  cls: "bg-muted text-muted-foreground" },
  starter:  { label: "Starter",  cls: "bg-blue-100 text-blue-700" },
  pro:      { label: "Pro",      cls: "bg-primary/10 text-primary" },
  business: { label: "Business", cls: "bg-amber-100 text-amber-700" },
};

interface Props {
  userFullName: string;
  plan: string;
  recentOrders: OrderNotif[];
  businesses: Business[];
  currentBusiness: Business | null;
}

export function DashboardTopbar({ userFullName, plan, recentOrders, businesses, currentBusiness }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [unreadOnly, setUnreadOnly] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const planInfo = PLAN_LABELS[plan] ?? PLAN_LABELS.free;
  const initials = userFullName?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "U";

  // Load read IDs from localStorage (after hydration)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("edinio_read_notifs");
      if (stored) setReadIds(new Set(JSON.parse(stored) as string[]));
    } catch {}
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const unreadOrders = recentOrders.filter(o => !readIds.has(o.id));
  const visibleOrders = unreadOnly ? unreadOrders : recentOrders;
  const unreadCount = unreadOrders.length;

  function markAllRead() {
    const newIds = new Set([...readIds, ...recentOrders.map(o => o.id)]);
    setReadIds(newIds);
    try { localStorage.setItem("edinio_read_notifs", JSON.stringify([...newIds])); } catch {}
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
      setSearch("");
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
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-popover border border-border rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[500px]">
              {/* Header */}
              <div className="px-5 py-4 border-b border-border flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">Notificari</p>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                        {unreadCount} noi
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                {recentOrders.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setUnreadOnly(false)}
                      className={cn(
                        "flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors",
                        !unreadOnly ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Toate
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnreadOnly(true)}
                      className={cn(
                        "flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors",
                        unreadOnly ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      View unread only {unreadCount > 0 && `(${unreadCount})`}
                    </button>
                  </div>
                )}
              </div>

              {/* List */}
              <div className="overflow-y-auto flex-1">
                {visibleOrders.length > 0 ? (
                  visibleOrders.map(order => {
                    const isUnread = !readIds.has(order.id);
                    return (
                      <Link
                        key={order.id}
                        href={`/dashboard/orders/${order.id}`}
                        onClick={() => {
                          setNotifOpen(false);
                          const newIds = new Set([...readIds, order.id]);
                          setReadIds(newIds);
                          try { localStorage.setItem("edinio_read_notifs", JSON.stringify([...newIds])); } catch {}
                        }}
                        className="flex items-start gap-3.5 px-5 py-3.5 hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                      >
                        {/* Unread dot */}
                        <div className="flex-shrink-0 mt-1.5">
                          {isUnread
                            ? <span className="block w-2 h-2 rounded-full bg-primary" />
                            : <span className="block w-2 h-2 rounded-full bg-transparent" />
                          }
                        </div>
                        {/* Icon */}
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                          isUnread ? "bg-amber-100" : "bg-muted"
                        )}>
                          <ShoppingCart className={cn("h-4 w-4", isUnread ? "text-amber-600" : "text-muted-foreground")} />
                        </div>
                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm leading-snug",
                            isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                          )}>
                            Comanda noua de la {order.customer_name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-foreground">{formatPrice(order.total)}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{formatTimeAgo(order.created_at)}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="px-5 py-12 text-center">
                    <Bell className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">
                      {unreadOnly ? "Nicio notificare necitita" : "Nicio notificare"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {unreadOnly ? "Ai citit toate notificarile" : "Comenzile noi vor aparea aici"}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              {recentOrders.length > 0 && (
                <div className="px-5 py-3 border-t border-border flex-shrink-0 bg-muted/30">
                  <Link
                    href="/dashboard/orders"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
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
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold mt-1", planInfo.cls)}>
                  {planInfo.label}
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
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: "var(--color-brand)" }}>E</div>
            <span className="text-base font-semibold text-foreground">Edinio</span>
          </div>
          <button type="button" onClick={() => setMobileOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
            <X className="h-4.5 w-4.5 text-muted-foreground" />
          </button>
        </div>

        {/* Business switcher */}
        <div className="px-3 py-3 border-b border-sidebar-border">
          <button onClick={() => setSwitcherOpen(!switcherOpen)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-left">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: currentBusiness?.primary_color ?? "var(--color-brand)" }}>
                {(currentBusiness?.store_name ?? currentBusiness?.business_name)?.[0]?.toUpperCase() ?? "M"}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">{currentBusiness?.store_name ?? currentBusiness?.business_name ?? "Magazinul tau"}</div>
                <div className="text-xs text-muted-foreground">Mini-Store</div>
              </div>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform", switcherOpen && "rotate-180")} />
          </button>
          {switcherOpen && (
            <div className="mt-1 bg-popover border border-border rounded-lg shadow-sm overflow-hidden">
              {businesses.map(b => (
                <button key={b.id} onClick={() => setSwitcherOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors text-sm text-left">
                  <div className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: b.primary_color }}>
                    {(b.store_name ?? b.business_name)[0]?.toUpperCase()}
                  </div>
                  <span className="truncate text-foreground">{b.store_name ?? b.business_name}</span>
                </button>
              ))}
              <div className="border-t border-border">
                <Link href="/onboarding/details" onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors text-sm text-muted-foreground">
                  <Plus className="h-3.5 w-3.5" />
                  Adauga magazin nou
                </Link>
              </div>
            </div>
          )}
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
