"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Pencil, BarChart2, Settings,
  Package, ShoppingCart, ChevronDown, Plus, Zap, Ticket, Tag, MessageSquare, LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useState } from "react";
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
      { href: "/dashboard/products/categories", label: "Categorii" },
    ],
  },
  { href: "/dashboard/orders", icon: ShoppingCart, label: "Comenzi" },
  { href: "/dashboard/discounts", icon: Ticket, label: "Discounturi" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Statistici" },
];

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

export function Sidebar({ businesses, currentBusiness, plan, smsoEnabled, unreadSupportCount = 0 }: {
  businesses: Business[];
  currentBusiness: Business | null;
  plan: string;
  smsoEnabled?: boolean;
  unreadSupportCount?: number;
}) {
  const pathname = usePathname();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 bg-sidebar border-r border-sidebar-border z-20"
      style={{ width: "var(--sidebar-width)" }}>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: "var(--color-brand)" }}>E</div>
        <span className="text-base font-semibold text-foreground tracking-tight">Edinio</span>
      </div>

      {/* Business switcher */}
      <div className="px-3 py-3 border-b border-sidebar-border">
        <div className="relative">
          <button onClick={() => setSwitcherOpen(!switcherOpen)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-left">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: currentBusiness?.primary_color ?? "var(--color-brand)" }}>
                {(currentBusiness?.store_name ?? currentBusiness?.business_name)?.[0]?.toUpperCase() ?? "M"}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">
                  {currentBusiness?.store_name ?? currentBusiness?.business_name ?? "Magazinul tau"}
                </div>
                <div className="text-xs text-muted-foreground">Mini-Store</div>
              </div>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform", switcherOpen && "rotate-180")} />
          </button>

          {switcherOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-md z-10 overflow-hidden">
              {businesses.map((b) => (
                <button key={b.id} onClick={() => setSwitcherOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors text-left text-sm">
                  <div className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: b.primary_color }}>
                    {(b.store_name ?? b.business_name)[0]?.toUpperCase()}
                  </div>
                  <span className="truncate text-foreground">{b.store_name ?? b.business_name}</span>
                </button>
              ))}
              <div className="border-t border-border">
                <Link href="/onboarding/details"
                  className="flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors text-sm text-muted-foreground"
                  onClick={() => setSwitcherOpen(false)}>
                  <Plus className="h-3.5 w-3.5" />
                  Adauga magazin nou
                </Link>
              </div>
            </div>
          )}
        </div>
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
                        {child.label === "Categorii" && <Tag className="h-3 w-3 flex-shrink-0" />}
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
