"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, LifeBuoy, Settings, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/ui/Logo";
import { intrareActiva, meniuPentru, type IntrarePanou } from "@/lib/navigatie-panou";
import { stareMagazin } from "@/lib/stare-magazin";
import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];

/*
  ⚠ MENIUL NU MAI E SCRIS AICI: vine din `@/lib/navigatie-panou`, acelasi pentru
  bara laterala si pentru sertarul de pe telefon. Erau doua liste, si divergisera
  (vezi nota din modul).
*/

export function BusinessCard({ business }: { business: Business | null }) {
  const color = business?.primary_color ?? "#07c527";
  const name = business?.store_name ?? business?.business_name ?? "Magazinul tau";
  const initial = name[0]?.toUpperCase() ?? "M";
  const domain = business?.custom_domain
    ? business.custom_domain
    : business?.slug
      ? `edinio.com/${business.slug}`
      : null;
  const stare = stareMagazin(business);

  return (
    <div
      className="relative overflow-hidden rounded-xl p-3"
      style={{ background: `linear-gradient(135deg, ${color}12, ${color}06)` }}
    >
      <div
        className="absolute -top-3 -right-3 h-16 w-16 rounded-full"
        style={{ backgroundColor: color, opacity: 0.06 }}
      />
      <div className="relative flex items-center gap-3">
        {/*
          Sigla magazinului, nu initiala lui. Cand nu exista sigla incarcata,
          ramane initiala pe fundal colorat: un patrat gol ar arata a lipsa.

          `<img>` simplu, nu `next/image`: siglele stau pe domenii de magazin
          care nu sunt in lista de gazde ingaduite, iar optimizatorul le-ar
          refuza. E o imagine de 36 de pixeli.
        */}
        {business?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.logo_url}
            alt=""
            className="h-9 w-9 flex-shrink-0 rounded-xl bg-card object-contain ring-1 ring-foreground/10"
          />
        ) : (
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
            style={{ backgroundColor: color, boxShadow: `0 4px 12px ${color}30` }}
          >
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-foreground">{name}</div>
          {domain && (
            <div className="mt-0.5 flex items-center gap-1.5" title={stare.text}>
              <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", stare.culoare)} />
              <span className="truncate text-[11px] text-muted-foreground">{domain}</span>
              <span className="sr-only">{stare.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active, badge = 0 }: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
    )}>
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

/**
 * O sectiune cu submeniu.
 *
 * ⚠ SAGEATA E OBLIGATORIE (cerere din 20.09.2026): pana acum, submeniurile
 * apareau doar cand intrai in sectiune, deci nimic nu spunea ca ele exista.
 * Din afara, „Comenzi" si „Clienti" aratau la fel, desi una ascunde retururile
 * si decontarile.
 *
 * Sageata deschide si inchide, iar sectiunea in care te afli se deschide
 * singura: cine e inauntru vede imediat unde poate merge mai departe.
 */
function GrupNav({
  intrare, caleaCurenta, badge = 0,
}: {
  intrare: IntrarePanou;
  caleaCurenta: string;
  badge?: number;
}) {
  const activ = intrareActiva(intrare, caleaCurenta);
  const [deschisManual, setDeschisManual] = useState<boolean | null>(null);
  const deschis = deschisManual ?? activ;
  const Icon = intrare.icon;

  return (
    <div>
      <div className={cn(
        "flex items-center rounded-lg pr-1 transition-all",
        activ ? "bg-primary/10" : "hover:bg-accent",
      )}>
        <Link
          href={intrare.href}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
            activ ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 truncate">{intrare.label}</span>
          {badge > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setDeschisManual(!deschis)}
          aria-expanded={deschis}
          aria-label={`${deschis ? "Inchide" : "Deschide"} ${intrare.label}`}
          className={cn(
            "grid h-7 w-7 flex-shrink-0 place-items-center rounded-md transition-colors",
            activ ? "text-primary hover:bg-primary/10" : "text-muted-foreground/70 hover:bg-accent hover:text-foreground",
          )}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", deschis && "rotate-90")} />
        </button>
      </div>

      {deschis && (
        <div className="mt-0.5 ml-7 space-y-0.5 border-l border-border pl-3">
          {(intrare.children ?? []).map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                caleaCurenta === child.href
                  ? "bg-primary/5 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="min-w-0 truncate">{child.label}</span>
              {child.beta && (
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-primary uppercase">
                  Beta
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ currentBusiness, plan, smsoEnabled = false, unreadSupportCount = 0, unreadReturnsCount = 0, isAdmin = false }: {
  currentBusiness: Business | null;
  plan: string;
  smsoEnabled?: boolean;
  unreadSupportCount?: number;
  unreadReturnsCount?: number;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const meniu = meniuPentru({ smsoEnabled });

  return (
    <aside
      className="fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-sidebar-border bg-sidebar lg:flex"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="border-b border-sidebar-border px-4 py-4">
        <Logo size="sm" href="/dashboard" eager />
      </div>

      <div className="border-b border-sidebar-border px-3 py-3">
        <BusinessCard business={currentBusiness} />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {meniu.map((intrare) => {
          const badge = intrare.href === "/dashboard/orders" ? unreadReturnsCount : 0;
          return intrare.children ? (
            <GrupNav key={intrare.href} intrare={intrare} caleaCurenta={pathname} badge={badge} />
          ) : (
            <NavItem
              key={intrare.href}
              href={intrare.href}
              icon={intrare.icon}
              label={intrare.label}
              active={intrareActiva(intrare, pathname)}
              badge={badge}
            />
          );
        })}
      </nav>

      {plan === "free" && (
        <div className="mx-3 mb-2 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <span className="text-xs font-semibold text-foreground">Plan Gratuit</span>
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
            Upgrade la Pro pentru functii avansate si suport prioritar.
          </p>
          <Link href="/dashboard/settings#abonament"
            className="block rounded-lg bg-primary py-1.5 text-center text-xs font-semibold text-white transition-colors hover:bg-primary/90">
            Upgrade acum
          </Link>
        </div>
      )}

      <div className="px-3 pb-1">
        <div className="relative">
          <NavItem
            href="/dashboard/suport"
            icon={LifeBuoy}
            label="Suport"
            active={pathname.startsWith("/dashboard/suport")}
          />
          {unreadSupportCount > 0 && (
            <span className="pointer-events-none absolute top-1/2 right-3 flex h-[18px] min-w-[18px] -translate-y-1/2 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {unreadSupportCount}
            </span>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="px-3 pb-1">
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-lg bg-warning/10 px-3 py-2 text-sm font-semibold text-warning transition-all hover:bg-warning/15"
          >
            <ShieldCheck className="h-4 w-4 flex-shrink-0" />
            Panou Admin
          </Link>
        </div>
      )}

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
