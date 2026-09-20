"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, LayoutDashboard, Package, ShieldCheck, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/*
  ═══════════════════════════════════════════════════════════════════════════
  BARA DE JOS, PE TELEFON
  ═══════════════════════════════════════════════════════════════════════════

  Ordinea ceruta de proprietar (20.09.2026): Acasa, Comenzi, Produse, Statistici.
  „Editor" a iesit: pe telefon nu se editeaza design, si ocupa un sfert din bara.

  ⚠ STICLA, NU PERETE. Bara sta peste continut, deci e translucida si
  neclarizeaza ce trece pe sub ea, cu o linie de par deasupra in loc de chenar.
  Asa se vede ca pagina continua dedesubt, in loc sa para taiata.

  ⚠ ZONA SIGURA A TELEFONULUI. `env(safe-area-inset-bottom)` tine bara deasupra
  liniei de acasa de pe iPhone. Fara ea, ultimul rand de etichete cade chiar sub
  degetul care gliseaza si devine de neatins.

  ⚠ TINTELE RAMAN DE 44 DE PUNCTE inaltime, minimul lui Apple pentru ceva ce se
  atinge cu degetul; pastila din spatele pictogramei arata unde esti fara sa mai
  fie nevoie de inca o culoare.
*/

const INTRARI = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Acasa" },
  { href: "/dashboard/orders", icon: ShoppingCart, label: "Comenzi" },
  { href: "/dashboard/products", icon: Package, label: "Produse" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Statistici" },
];

export function BottomNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  /*
    Formularul de produs are bara lui de salvare, lipita jos. Doua bare una
    peste alta ar fi acoperit jumatate din ecran, deci aici nu se arata.
    (Pachetele folosesc alt formular, fara bara fixa, deci raman cu meniul.)
  */
  const eFormularDeProdus =
    pathname === "/dashboard/products/new" ||
    /^\/dashboard\/products\/[^/]+\/edit$/.test(pathname);
  if (eFormularDeProdus) return null;

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-20 border-t border-foreground/10 bg-background/80 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {INTRARI.map(({ href, icon: Icon, label }) => {
          const activ = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={activ ? "page" : undefined}
              className="group flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-1.5 pb-1"
            >
              <span
                className={cn(
                  "grid h-7 w-12 place-items-center rounded-full transition-all duration-200",
                  activ ? "bg-primary/12 text-primary" : "text-muted-foreground group-active:scale-95",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={activ ? 2.2 : 1.8} />
              </span>
              <span
                className={cn(
                  "text-[10px] leading-none tracking-[0.01em] transition-colors",
                  activ ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {isAdmin && (
          <Link
            href="/admin"
            className="group flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-1.5 pb-1"
          >
            <span className="grid h-7 w-12 place-items-center rounded-full text-warning transition-all duration-200 group-active:scale-95">
              <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span className="text-[10px] leading-none font-medium text-warning">Admin</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
