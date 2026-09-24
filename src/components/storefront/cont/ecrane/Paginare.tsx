import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUTON_SECUNDAR } from "../ui/clase";

/**
 * Paginarea listelor din cont. `?p=` se citeste in pagina, ca numar pozitiv;
 * aici doar se deseneaza.
 *
 * ⚠ `cn`, nu lipire de siruri: `BUTON_SECUNDAR` are deja `px-5` si `min-h-11`, iar
 * intre doua clase de acelasi fel scrise alaturi castiga ordinea din CSS, nu cea
 * din sir. Pe telefon butoanele raman numai sageata (textul ramane pentru cititorul
 * de ecran), ca randul sa incapa la 320px.
 */
export function Paginare({ baza, pagina, pagini }: { baza: string; pagina: number; pagini: number }) {
  if (pagini <= 1) return null;
  const buton = cn(BUTON_SECUNDAR, "min-h-10 px-3 sm:px-5");
  return (
    <nav aria-label="Paginare" className="flex items-center justify-between gap-3 pt-1">
      {pagina > 1 ? (
        <Link href={`${baza}?p=${pagina - 1}`} className={buton} rel="prev">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Anterioara</span>
        </Link>
      ) : <span />}
      <span className="text-sm tabular-nums text-[var(--st-on-bg)] opacity-75">
        Pagina {pagina} din {pagini}
      </span>
      {pagina < pagini ? (
        <Link href={`${baza}?p=${pagina + 1}`} className={buton} rel="next">
          <span className="sr-only sm:not-sr-only">Urmatoare</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : <span />}
    </nav>
  );
}
