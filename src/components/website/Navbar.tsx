"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const NAV_LINKS = [
  { href: "/", label: "Acasa" },
  { href: "/preturi", label: "Preturi" },
  { href: "/#functionalitati", label: "Functionalitati" },
  { href: "/contact", label: "Contact" },
];

const ANNOUNCEMENT =
  "Mentenanta gratuita pe viata la orice abonament";

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/#")) return pathname === "/";
    return pathname === href;
  };

  return (
    <>
      {/* ── Announcement bar ── */}
      <div className="relative bg-primary text-white overflow-hidden">
        <div className="flex items-center h-9">
          <div className="flex animate-marquee whitespace-nowrap">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} className="inline-flex items-center gap-2.5 mx-10 text-xs font-medium tracking-wide uppercase">
                <Sparkles className="h-3 w-3 opacity-70 flex-shrink-0" />
                {ANNOUNCEMENT}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main navbar ── */}
      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-300 border-b bg-background",
          scrolled
            ? "shadow-lg shadow-black/[0.03] border-border"
            : "border-border"
        )}
      >
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-sm shadow-md shadow-primary/25 transition-transform group-hover:scale-105">
              E
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight">
              Edinio
            </span>
          </Link>

          {/* Desktop links — pill style */}
          <div className="hidden md:flex items-center gap-1 rounded-full bg-muted/60 backdrop-blur-sm border border-border/50 px-1.5 py-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                  isActive(link.href)
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-2.5">
            <Link
              href="/login"
              className="inline-flex items-center justify-center h-9 px-5 rounded-full text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
            >
              Conecteaza-te
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center h-9 px-5 rounded-full bg-primary text-white text-sm font-semibold shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/30 hover:bg-primary/90 transition-all duration-200"
            >
              Incepe gratuit
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted/80 transition-colors"
            aria-label="Meniu"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </nav>

        {/* Mobile menu — glass panel */}
        {mobileOpen && (
          <div className="md:hidden glass-nav border-t border-white/10">
            <div className="max-w-6xl mx-auto px-4 py-4 space-y-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "block px-4 py-3 rounded-xl text-sm font-medium transition-all",
                    isActive(link.href)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 mt-2 border-t border-border/50 space-y-2">
                <Link
                  href="/login"
                  className="block py-3 rounded-xl border border-border/50 text-sm font-medium text-center text-foreground hover:bg-muted/60 transition-colors"
                >
                  Conecteaza-te
                </Link>
                <Link
                  href="/register"
                  className="block py-3 rounded-xl bg-primary text-white text-sm font-semibold text-center shadow-md shadow-primary/25 hover:bg-primary/90 transition-colors"
                >
                  Incepe gratuit
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
