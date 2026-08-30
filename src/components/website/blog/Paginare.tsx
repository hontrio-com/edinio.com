import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Rândul de pagini de sub o listă de articole.
 *
 * ⚠ LEGĂTURI ADEVĂRATE, NU BUTOANE. Un crawler nu apasă butoane și nu rulează
 * JavaScript. Dacă paginile 2 și mai departe ar fi ajuns prin apăsare, toate
 * articolele de dincolo de prima pagină ar fi fost de negăsit din site, chiar
 * dacă stau cuminți în sitemap. Aici fiecare pagină e un `<a href>` obișnuit.
 *
 * ⚠ PAGINA 1 SE SCRIE FĂRĂ `?p=1`. Altfel aceeași listă ar avea două adrese,
 * `/blog` și `/blog?p=1`, iar Google ar trebui să aleagă între ele. Adresa de
 * pornire e una singură.
 */
export function Paginare({
  pagina,
  pagini,
  adresa,
}: {
  pagina: number;
  pagini: number;
  /** Calea de bază, fără parametri. Ex. `/blog` sau `/blog/categorie/curierat`. */
  adresa: string;
}) {
  if (pagini <= 1) return null;

  /*
    ⚠ ADRESA POATE AVEA DEJA PARAMETRI. Pagina de căutare trimite
    `/blog/cautare?q=curieri`, iar lipirea oarbă a lui `?p=2` ar fi produs
    `?q=curieri?p=2` — o adresă în care al doilea `?` face parte din valoarea
    primului parametru. Rezultatul: paginarea căutării ar fi dus mereu la pagina
    întâi, fără nicio eroare care să dea de bănuit.
  */
  const catre = (n: number) => {
    if (n <= 1) return adresa;
    return `${adresa}${adresa.includes("?") ? "&" : "?"}p=${n}`;
  };

  /* Se arată cel mult șapte numere: primele, cele din jurul celei curente, și
     ultima. La douăzeci de pagini, un rând cu douăzeci de numere e mai greu de
     folosit decât unul cu șapte. */
  const numere: (number | "...")[] = [];
  for (let n = 1; n <= pagini; n++) {
    if (n === 1 || n === pagini || Math.abs(n - pagina) <= 1) numere.push(n);
    else if (numere[numere.length - 1] !== "...") numere.push("...");
  }

  return (
    <nav aria-label="Paginile listei" className="mt-12 flex items-center justify-center gap-1.5">
      {pagina > 1 && (
        <Link
          href={catre(pagina - 1)}
          rel="prev"
          aria-label="Pagina dinainte"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-hairline px-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-ink-3/40 hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Înapoi
        </Link>
      )}

      {numere.map((n, i) =>
        n === "..." ? (
          <span key={`gol-${i}`} className="px-1.5 text-[13.5px] text-ink-3" aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={n}
            href={catre(n)}
            aria-current={n === pagina ? "page" : undefined}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
              n === pagina
                ? "bg-ink text-white"
                : "border border-hairline text-ink-2 hover:border-ink-3/40 hover:text-ink",
            )}
          >
            {n}
          </Link>
        ),
      )}

      {pagina < pagini && (
        <Link
          href={catre(pagina + 1)}
          rel="next"
          aria-label="Pagina următoare"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-hairline px-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-ink-3/40 hover:text-ink"
        >
          Mai departe
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}

/** Numărul de pagină dintr-un `?p=`, curățat de ce nu e număr. */
export function paginaCeruta(v: string | string[] | undefined, pagini = Infinity): number {
  const brut = Array.isArray(v) ? v[0] : v;
  const n = Number.parseInt(brut ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, pagini);
}
