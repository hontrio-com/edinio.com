"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Pencil, BarChart2, Settings,
  Package, ShoppingCart, ShoppingBag, Zap, Ticket, MessageSquare, LifeBuoy, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/ui/Logo";
import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panou principal" },
  { href: "/dashboard/editor", icon: Pencil, label: "Editeaza magazinul" },
  { href: "/dashboard/features", icon: Zap, label: "Integrari" },
  {
    href: "/dashboard/products", icon: Package, label: "Produse",
    children: [
      { href: "/dashboard/products", label: "Toate produsele" },
      { href: "/dashboard/products/bundles", label: "Pachete" },
      { href: "/dashboard/products/categories", label: "Categorii" },
    ],
  },
  { href: "/dashboard/orders", icon: ShoppingCart, label: "Comenzi" },
  { href: "/dashboard/abandoned", icon: ShoppingBag, label: "Cosuri abandonate" },
  { href: "/dashboard/discounts", icon: Ticket, label: "Discounturi" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Statistici" },
];

export function BusinessCard({ business }: { business: Business | null }) {
  const color = business?.primary_color ?? "#1AB554";
  const name = business?.store_name ?? business?.business_name ?? "Magazinul tau";
  const initial = name[0]?.toUpperCase() ?? "M";
  const domain = business?.custom_domain
    ? business.custom_domain
    : business?.slug
      ? `edinio.com/${business.slug}`
      : null;

  return (
    <div
      className="relative overflow-hidden rounded-xl p-3"
      style={{ background: `linear-gradient(135deg, ${color}12, ${color}06)` }}
    >
      <div
        className="absolute -right-3 -top-3 w-16 h-16 rounded-full"
        style={{ backgroundColor: color, opacity: 0.06 }}
      />
      <div className="relative flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: color, boxShadow: `0 4px 12px ${color}30` }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-foreground truncate">{name}</div>
          {domain && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-[11px] text-muted-foreground truncate">{domain}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active }: {
  href: string; icon: React.ComponentType<{ className?: string }>; label: string; active: boolean;
}) {
  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
    )}>
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar({ currentBusiness, plan, smsoEnabled, unreadSupportCount = 0, isAdmin = false }: {
  currentBusiness: Business | null;
  plan: string;
  smsoEnabled?: boolean;
  unreadSupportCount?: number;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 bg-sidebar border-r border-sidebar-border z-20"
      style={{ width: "var(--sidebar-width)" }}>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <Logo size="sm" href="/dashboard" />
      </div>

      {/* Business info */}
      <div className="px-3 py-3 border-b border-sidebar-border">
        <BusinessCard business={currentBusiness} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

          if ("children" in item && item.children) {
            return (
              <div key={item.href}>
                <NavItem href={item.href} icon={item.icon} label={item.label} active={isActive} />
                {isActive && (
                  <div className="ml-7 mt-0.5 space-y-0.5 border-l border-border pl-3">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all",
                          pathname === child.href
                            ? "text-primary bg-primary/5"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={isActive} />
          );
        })}

        {smsoEnabled && (
          <NavItem
            href="/dashboard/sms"
            icon={MessageSquare}
            label="SMS Marketing"
            active={pathname.startsWith("/dashboard/sms")}
          />
        )}
      </nav>

      {/* Upgrade banner (free plan) */}
      {plan === "free" && (
        <div className="mx-3 mb-2 p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
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

      {/* Support */}
      <div className="px-3 pb-1">
        <div className="relative">
          <NavItem
            href="/dashboard/suport"
            icon={LifeBuoy}
            label="Suport"
            active={pathname.startsWith("/dashboard/suport")}
          />
          {unreadSupportCount > 0 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-white text-[10px] font-bold rounded-full px-1 pointer-events-none">
              {unreadSupportCount}
            </span>
          )}
        </div>
      </div>

      {/* Admin Panel */}
      {isAdmin && (
        <div className="px-3 pb-1">
          <Link
            href="/admin"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
          >
            <ShieldCheck className="h-4 w-4 flex-shrink-0" />
            Panou Admin
          </Link>
        </div>
      )}

      {/* Settings */}
      <div className="px-3 pb-3">
        <NavItem
          href="/dashboard/settings"
          icon={Settings}
          label="Setari"
          active={pathname.startsWith("/dashboard/settings")}
        />
      </div>
    </aside>
  );
}
