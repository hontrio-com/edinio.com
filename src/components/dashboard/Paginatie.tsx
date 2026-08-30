"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { numereDeAratat } from "@/lib/paginare";

/**
 * Paginație cu numere, nu doar „înainte" și „înapoi".
 *
 * ═══ ⚠ DE CE EXISTĂ ═══
 *
 * Ecranul de oferte eMAG arată 50 pe pagină. După importul din contul unui
 * comerciant erau 3.754 de oferte, adică 76 de pagini — iar singura cale de a ajunge
 * la pagina 60 era să apeși „înainte" de cincizeci și nouă de ori.
 *
 * ⚠ Stă într-un singur fișier fiindcă e folosită în două ecrane. Două copii ale
 * aceleiași bare se despart la prima schimbare, iar despărțirea nu se vede: două
 * liste care arată la fel și se poartă altfel.
 *
 * ═══ CE ARATĂ, ȘI DE CE ATÂT ═══
 *
 * Prima pagină, ultima, și o fereastră în jurul celei curente. Restul se strâng în
 * „…". Toate cele 76 de numere pe un rând ar fi fost un zid pe care nu-l citește
 * nimeni; doar „înainte/înapoi" e o plimbare. Fereastra dă și un lucru care lipsea
 * cu totul: **unde ești** în listă.
 */

interface Props {
  /** Pagina curentă, numărată de la 1. */
  pagina: number;
  /** Câte pagini sunt în total. Sub 2, bara nu se arată deloc. */
  pagini: number;
  /** Se cheamă cu pagina cerută. */
  laSchimbare: (p: number) => void;
  /** Cât timp se încarcă, butoanele se sting ca să nu se ceară două pagini deodată. */
  seIncarca?: boolean;
  /** Textul din dreapta: „51–100 din 3.754". Opțional. */
  rezumat?: string;
}

const BUTON = "min-w-8 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40";

export function Paginatie({ pagina, pagini, laSchimbare, seIncarca = false, rezumat }: Props) {
  if (pagini <= 1) return null;
  const numere = numereDeAratat(pagina, pagini);

  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-3" aria-label="Paginare">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button" className={BUTON} disabled={pagina <= 1 || seIncarca}
          onClick={() => laSchimbare(pagina - 1)} aria-label="Pagina anterioară"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {numere.map((n, i) =>
          n === "…" ? (
            /* ⚠ `aria-hidden`: cititorul de ecran n-are ce face cu trei puncte, iar
               anunțate ar rupe numărătoarea paginilor citite cu voce. */
            <span key={`gol-${i}`} aria-hidden className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={n} type="button" disabled={seIncarca}
              onClick={() => laSchimbare(n)}
              aria-current={n === pagina ? "page" : undefined}
              className={
                n === pagina
                  ? `${BUTON} border-primary bg-primary font-semibold text-primary-foreground`
                  : BUTON
              }
            >
              {n}
            </button>
          ),
        )}

        <button
          type="button" className={BUTON} disabled={pagina >= pagini || seIncarca}
          onClick={() => laSchimbare(pagina + 1)} aria-label="Pagina următoare"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {rezumat && <span className="text-xs text-muted-foreground tabular-nums">{rezumat}</span>}
    </nav>
  );
}
