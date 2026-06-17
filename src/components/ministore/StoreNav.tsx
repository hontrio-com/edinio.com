"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { menuItemHref, isExternalLink, type MenuItem } from "@/lib/pages/menu";

/** Desktop inline navigation links (hidden on mobile). */
export function StoreNavLinks({ items, basePath, color, currentSlug, className }: {
  items: MenuItem[]; basePath: string; color: string; currentSlug?: string | null; className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav className={`hidden md:flex items-center gap-0.5 ${className ?? ""}`}>
      {items.map((it) => {
        const href = menuItemHref(it, basePath);
        const ext = isExternalLink(it);
        const active = !!currentSlug && it.type === "page" && it.target === currentSlug;
        return (
          <a key={it.id} href={href} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="px-3 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            style={active ? { color, fontWeight: 600 } : undefined}>
            {it.label}
          </a>
        );
      })}
    </nav>
  );
}

/** Mobile hamburger button + slide-in panel (hidden on desktop). */
export function StoreNavHamburger({ items, basePath, color, currentSlug, logoUrl, storeName }: {
  items: MenuItem[]; basePath: string; color: string; currentSlug?: string | null;
  logoUrl?: string | null; storeName: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button type="button" aria-label="Deschide meniul" onClick={() => setOpen(true)}
        className="md:hidden w-9 h-9 rounded-xl border border-border bg-surface flex items-center justify-center hover:bg-muted transition-colors shrink-0">
        <Menu className="h-4.5 w-4.5 text-foreground" size={18} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] md:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[82vw] bg-background z-[60] md:hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 h-16 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={storeName} className="h-8 w-auto max-w-[120px] object-contain" />
                ) : (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: color }}>
                    {storeName[0]?.toUpperCase()}
                  </div>
                )}
                <span className="font-semibold text-sm text-foreground truncate">{storeName}</span>
              </div>
              <button type="button" aria-label="Inchide meniul" onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {items.map((it) => {
                const href = menuItemHref(it, basePath);
                const ext = isExternalLink(it);
                const active = !!currentSlug && it.type === "page" && it.target === currentSlug;
                return (
                  <a key={it.id} href={href} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-3 rounded-xl text-base font-medium text-foreground hover:bg-muted transition-colors"
                    style={active ? { color, backgroundColor: `${color}10` } : undefined}>
                    {it.label}
                  </a>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
