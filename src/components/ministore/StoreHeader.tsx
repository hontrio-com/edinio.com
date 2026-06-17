"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, Phone } from "lucide-react";
import { StoreNavLinks, StoreNavHamburger } from "./StoreNav";
import type { MenuItem } from "@/lib/pages/menu";

interface HeaderBusiness {
  slug: string;
  business_name: string;
  store_name: string | null;
  logo_url: string | null;
  primary_color: string;
  phone: string | null;
}

/**
 * Shared storefront header for custom pages. Logo (left) + nav menu (inline on
 * desktop, hamburger on mobile) + a cart link back to the store. When `menu` is
 * empty there is no menu and no hamburger — just logo + cart.
 */
export function StoreHeader({ business, menu, basePath, currentSlug, logoSize = 36 }: {
  business: HeaderBusiness;
  menu: MenuItem[];
  basePath: string;
  currentSlug?: string | null;
  logoSize?: number;
}) {
  const color = business.primary_color ?? "#1AB554";
  const name = business.store_name ?? business.business_name;
  const [count, setCount] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(`cart_${business.slug}`);
        if (stored) {
          const items = JSON.parse(stored) as { quantity: number }[];
          setCount(items.reduce((s, i) => s + (i.quantity ?? 0), 0));
        }
      } catch {}
    });
    return () => cancelAnimationFrame(raf);
  }, [business.slug]);

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <StoreNavHamburger items={menu} basePath={basePath} color={color} currentSlug={currentSlug} logoUrl={business.logo_url} storeName={name} />
          <a href={`${basePath}/`} className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity">
            {business.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logo_url} alt={name} style={{ height: logoSize, maxWidth: logoSize * 4.2 }} className="w-auto object-contain shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: color }}>
                {name[0]?.toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-sm text-foreground truncate hidden sm:block">{name}</span>
          </a>
        </div>

        <StoreNavLinks items={menu} basePath={basePath} color={color} currentSlug={currentSlug} className="flex-1 justify-center" />

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {business.phone && (
            <a href={`tel:${business.phone}`} aria-label="Suna" className="hidden sm:flex w-9 h-9 rounded-xl border border-border bg-surface items-center justify-center hover:bg-muted transition-colors">
              <Phone className="h-4 w-4" style={{ color }} />
            </a>
          )}
          <a href={`${basePath}/`} aria-label="Mergi la magazin"
            className="relative flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-surface hover:bg-muted transition-colors">
            <ShoppingCart className="h-4 w-4 text-foreground" />
            {count > 0 ? (
              <span className="text-sm font-semibold text-foreground tabular-nums">{count}</span>
            ) : (
              <span className="hidden sm:inline text-sm text-muted-foreground">Magazin</span>
            )}
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: color }}>
                {count > 9 ? "9+" : count}
              </span>
            )}
          </a>
        </div>
      </div>
    </header>
  );
}
