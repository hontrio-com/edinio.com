import { CalendarClock, FileCheck2, ShoppingBag } from "lucide-react";
import { CardTbi, LogoTbi } from "@/components/storefront/CardTbi";

/** Pasii: exact drumul din magazin, nimic promis in numele bancii (fara „aprobare rapida"). */
const PASI = [
  { Icon: ShoppingBag, text: "Comanzi produsul" },
  { Icon: CalendarClock, text: "Alegi plata in rate" },
  { Icon: FileCheck2, text: "Completezi cererea online" },
] as const;

/**
 * Forma `banner` a mesajului tbi de pe pagina produsului: cardul in straturi (`CardTbi`), cu sigla tbi
 * MARE in stanga, titlul si o propozitie, iar dedesubt o banda cu cei trei pasi.
 *
 * Inlocuieste prima varianta (15.11), respinsa de proprietar ca „prea vibe code": fond portocaliu
 * translucid si cifre in cercuri portocalii. Acum culoarea tbi vine DOAR din sigla lor.
 *
 * ⚠ Fara nicio cifra de credit (rata, dobanda, DAE, luni): vezi `FORME_BANNER_TBI`. Fara diacritice.
 */
export function BannerRateTbi() {
  return (
    <CardTbi>
      <div className="flex items-center gap-3.5 px-4 py-3.5">
        <LogoTbi />
        <span aria-hidden="true" className="h-9 w-px shrink-0 bg-neutral-950/10" />
        <div className="min-w-0">
          <p className="text-balance text-[15px] font-semibold leading-snug text-neutral-900">Cumpara acum, plateste in rate</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-neutral-500">Alegi tbi bank la finalizarea comenzii.</p>
        </div>
      </div>
      <ol className="grid grid-cols-3 divide-x divide-neutral-950/10 border-t border-neutral-950/10 bg-stone-100/80">
        {PASI.map(({ Icon, text }) => (
          <li key={text} className="flex flex-col items-center gap-1 px-1.5 py-2.5 text-center text-[11px] font-medium leading-tight text-neutral-600">
            <Icon aria-hidden="true" className="h-4 w-4 text-neutral-900" strokeWidth={1.75} />
            {text}
          </li>
        ))}
      </ol>
    </CardTbi>
  );
}
