import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BUTON_SECUNDAR } from "../ui/clase";

/**
 * Paginarea listelor din cont. `?p=` se citeste in pagina, ca numar pozitiv;
 * aici doar se deseneaza.
 */
export function Paginare({ baza, pagina, pagini }: { baza: string; pagina: number; pagini: number }) {
  if (pagini <= 1) return null;
  const buton = `${BUTON_SECUNDAR} min-h-10 px-3`;
  return (
    <nav aria-label="Paginare" className="flex items-center justify-between gap-3 pt-1">
      {pagina > 1 ? (
        <Link href={`${baza}?p=${pagina - 1}`} className={buton} rel="prev">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Inapoi
        </Link>
      ) : <span />}
      <span className="text-sm tabular-nums text-[var(--st-on-bg)] opacity-75">
        Pagina {pagina} din {pagini}
      </span>
      {pagina < pagini ? (
        <Link href={`${baza}?p=${pagina + 1}`} className={buton} rel="next">
          Inainte
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : <span />}
    </nav>
  );
}
