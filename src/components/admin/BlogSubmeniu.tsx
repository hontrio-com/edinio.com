import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * Navigarea dintre ecranele blogului.
 *
 * Bara laterala are o singura intrare, „Blog"; de aici incolo se merge intre
 * articole, autori si categorii. Asa bara laterala nu se umfla cu trei randuri
 * pentru o parte a panoului, iar cele trei ecrane se simt ca un singur loc.
 *
 * „Articole" e prima si va fi ecranul principal. Pana exista, intrarea nu e
 * pusa aici: un buton care nu duce nicaieri e mai rau decat lipsa lui.
 */
const FILE = [
  { cheie: "autori", href: "/admin/blog/autori", eticheta: "Autori" },
  { cheie: "categorii", href: "/admin/blog/categorii", eticheta: "Categorii" },
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
