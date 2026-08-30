import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * Navigarea dintre ecranele blogului.
 *
 * Bara laterală are o singură intrare, „Blog"; de aici încolo se merge între
 * articole, autori, categorii, etichete și abonați. Așa bara laterală nu se umflă cu un
 * rând pentru fiecare ecran, iar ele se simt ca un singur loc.
 *
 * ⚠ Numărul lor a crescut de la trei la cinci. Dacă mai vine unul, se schimbă
 * și rândurile de mai sus: un comentariu care numără greșit e o minciună mică,
 * dar exact felul de minciună care face pe cineva să nu mai creadă niciun
 * comentariu din fișier.
 */
const FILE = [
  { cheie: "articole", href: "/admin/blog", eticheta: "Articole" },
  { cheie: "autori", href: "/admin/blog/autori", eticheta: "Autori" },
  { cheie: "categorii", href: "/admin/blog/categorii", eticheta: "Categorii" },
  { cheie: "etichete", href: "/admin/blog/etichete", eticheta: "Etichete" },
  { cheie: "abonati", href: "/admin/blog/abonati", eticheta: "Abonati" },
] as const;

export function BlogSubmeniu({ activ }: { activ: (typeof FILE)[number]["cheie"] }) {
  return (
    <nav className="flex items-center gap-1 mb-6 border-b border-zinc-200 -mx-1">
      {FILE.map((f) => (
        <Link
          key={f.cheie}
          href={f.href}
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            f.cheie === activ
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-900",
          )}
        >
          {f.eticheta}
        </Link>
      ))}
    </nav>
  );
}
