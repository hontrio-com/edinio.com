"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Store, Receipt, ShoppingCart,
  LifeBuoy, BarChart2, Shield, ChevronRight, LogOut, Menu, X,
  History, Settings2, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const NAV = [
  { href: "/admin", icon: LayoutDashboard, label: "Prezentare generala", exact: true },
  { href: "/admin/utilizatori", icon: Users, label: "Utilizatori" },
  { href: "/admin/magazine", icon: Store, label: "Magazine" },
  { href: "/admin/comenzi", icon: ShoppingCart, label: "Comenzi" },
  { href: "/admin/domenii", icon: Globe, label: "Domenii" },
  { href: "/admin/facturi", icon: Receipt, label: "Facturi" },
  { href: "/admin/suport", icon: LifeBuoy, label: "Suport" },
  { href: "/admin/statistici", icon: BarChart2, label: "Statistici" },
  { href: "/admin/activitate", icon: History, label: "Activitate" },
  { href: "/admin/setari", icon: Settings2, label: "Setari platforma" },
];

function SidebarContent({ adminName, adminEmail, onClose }: { adminName: string; adminEmail: string; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <Logo size="sm" href="/admin" textClassName="text-white" />
        </div>
        {onClose && (
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors lg:hidden">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-primary/20 text-primary"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Back to dashboard */}
      <div className="px-3 pb-2">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Inapoi la dashboard
        </Link>
      </div>

      {/* Admin user */}
      <div className="border-t border-zinc-800 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{adminName}</p>
          <p className="text-[10px] text-zinc-400 truncate">{adminEmail}</p>
        </div>
        <button onClick={handleLogout} className="text-zinc-500 hover:text-red-400 transition-colors" title="Delogare">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AdminSidebar({ adminName, adminEmail }: { adminName: string; adminEmail: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-9 h-9 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div className={cn(
        "lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-zinc-900 border-r border-zinc-800 transition-transform duration-300",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent adminName={adminName} adminEmail={adminEmail} onClose={() => setMobileOpen(false)} />
      </div>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-zinc-900 dark:bg-zinc-950 border-r border-zinc-800"
        style={{ width: "var(--admin-sidebar-width, 240px)" }}
      >
        <SidebarContent adminName={adminName} adminEmail={adminEmail} />
      </aside>
    </>
  );
}
