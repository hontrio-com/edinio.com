import Link from "next/link";
import { MENIU, type CheieMeniu } from "./meniu";

/**
 * Meniul contului pe telefon si pe tableta: o grila cu toate sectiunile deodata.
 *
 * ⚠ Nu mai sunt file derulante: la 320px se vedeau trei din sase, fara nicio urma
 * ca mai sunt si altele, iar „Datele mele” (cu iesirea din cont) ramanea ascunsa.
 * Acum sunt 3x2 pe telefon si un singur rand de la `sm` in sus.
 * ⚠ Fara hamburger: antetul magazinului are deja unul, iar un al doilea ar
 * ascunde exact drumurile pentru care omul a intrat in cont.
 * ⚠ Fiecare fila e o placa pe suprafata (`--st-surface`), nu text direct pe fundalul
 * magazinului: asa se citeste la fel pe fundal deschis si pe fundal inchis.
 * ⚠ Inelul de focus e DESENAT INAUNTRU (`ring-inset`): placile stau lipite, iar un
 * inel cu distanta ar fi fost taiat de vecini.
 */
export function MeniuFile({ activ, numere }: { activ: CheieMeniu; numere: Partial<Record<CheieMeniu, number>> }) {
  return (
    <nav aria-label="Contul meu" className="mb-6 lg:hidden">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {MENIU.map((m) => {
          const este = m.cheie === activ;
          const n = numere[m.cheie];
          const Icon = m.icon;
          return (
            <li key={m.cheie} className="min-w-0">
              <Link
                href={m.href}
                aria-current={este ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-[min(var(--st-radius-sm),0.75rem)] border px-1 py-2 text-center text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--st-text)] ${
                  este
                    ? "border-[var(--st-text)] bg-[var(--st-primary-soft)] font-semibold text-[var(--st-text)]"
                    : "border-[var(--st-border)] bg-[var(--st-surface)] font-medium text-[var(--st-muted)] hover:text-[var(--st-text)]"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} aria-hidden="true" />
                <span className="max-w-full truncate">{m.scurt}</span>
                {typeof n === "number" && n > 0 && (
                  <span className="absolute right-1.5 top-1.5 text-[10px] font-semibold tabular-nums leading-none text-[var(--st-muted)]">
                    {n}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
