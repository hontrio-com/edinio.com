"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Pencil, Package, ShoppingCart, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Acasa" },
  { href: "/dashboard/editor", icon: Pencil, label: "Editor" },
  { href: "/dashboard/products", icon: Package, label: "Produse" },
  { href: "/dashboard/orders", icon: ShoppingCart, label: "Comenzi" },
];

export function BottomNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-20">
      <div className="flex items-stretch h-16">
        {ITEMS.map(({ href, icon: Icon, label }) => {
          const active = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
          return (
            <Link key={href} href={href}
              className={cn("flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground")}>
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link href="/admin"
            className="flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium text-amber-600">
            <ShieldCheck className="h-5 w-5" />
            Admin
          </Link>
        )}
      </div>
    </nav>
  );
}
