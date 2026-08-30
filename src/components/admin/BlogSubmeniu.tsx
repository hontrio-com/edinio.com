import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * Navigarea dintre ecranele blogului.
 *
 * Bara laterală are o singură intrare, „Blog"; de aici încolo se merge între
 * articole, autori, categorii, etichete, abonați și redactori. Așa bara laterală nu se umflă cu un
 * rând pentru fiecare ecran, iar ele se simt ca un singur loc.
 *
 * ⚠ Sunt șase, iar ULTIMELE DOUĂ se văd doar de admini: „Abonați" (date
 * personale) și „Redactori" (cine împarte dreptul de a scrie).
 * Dacă mai vine una, se schimbă
 * și rândurile de mai sus: un comentariu care numără greșit e o minciună mică,
 * dar exact felul de minciună care face pe cineva să nu mai creadă niciun
 * comentariu din fișier.
 */
const FILE = [
  { cheie: "articole", href: "/admin/blog", eticheta: "Articole" },
  { cheie: "autori", href: "/admin/blog/autori", eticheta: "Autori" },
  { cheie: "categorii", href: "/admin/blog/categorii", eticheta: "Categorii" },
  { cheie: "etichete", href: "/admin/blog/etichete", eticheta: "Etichete" },
  /* ⚠ Si abonatii doar pentru admini: sunt adrese de email ale unor oameni,
     adica date personale, si n-au nicio treaba cu scrisul articolelor. */
  { cheie: "abonati", href: "/admin/blog/abonati", eticheta: "Abonati", doarAdmin: true },
  /* ⚠ Doar pentru admini: cine imparte dreptul de a scrie nu poate fi cel care
     tocmai l-a primit. Ascunderea nu e paza — pagina cere `requireAdmin()` — dar
     o intrare care il arunca inapoi ar fi o usa incuiata pusa la vedere. */
  { cheie: "redactori", href: "/admin/blog/redactori", eticheta: "Redactori", doarAdmin: true },
] as const;

/**
 * ⚠ `rol` E OBLIGATORIU, si asta a fost o reparatie.
 *
 * Avea `= "admin"` drept implicit, iar patru din cele sapte ecrane nu-l
 * trimiteau deloc. Deci un REDACTOR vedea intrarea „Redactori", apasa, si era
 * aruncat la `/dashboard` fara nicio explicatie. O usa incuiata pusa la vedere e
 * mai rea decat un perete: omul crede ca a gresit el ceva.
 *
 * Fara implicit, o pagina noua nu mai poate uita rolul — o uita compilatorul in
 * locul nostru, cu o eroare.
 */
export function BlogSubmeniu({ activ, rol }: {
  activ: (typeof FILE)[number]["cheie"];
  rol: "admin" | "editor";
}) {
  const file = FILE.filter((f) => rol === "admin" || !("doarAdmin" in f && f.doarAdmin));
  return (
    <nav className="flex items-center gap-1 mb-6 border-b border-zinc-200 -mx-1">
      {file.map((f) => (
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
