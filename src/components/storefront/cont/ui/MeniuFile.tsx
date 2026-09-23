"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { MENIU, type CheieMeniu } from "./meniu";
import { FOCUS } from "./clase";

/**
 * Meniul contului pe telefon: file derulante sub antetul magazinului.
 *
 * ⚠ Fara hamburger: antetul magazinului are deja unul, iar un al doilea ar
 * ascunde exact drumurile pentru care omul a intrat in cont.
 * ⚠ Filele stau direct pe fundalul magazinului: `--st-on-bg`, nu `--st-text`.
 * ⚠ Fila activa se aduce in vedere cu `scrollLeft`, nu cu `scrollIntoView`, care
 * poate misca si pagina pe verticala la incarcare.
 */
export function MeniuFile({ activ, numere }: { activ: CheieMeniu; numere: Partial<Record<CheieMeniu, number>> }) {
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const ul = lista.current;
    const li = ul?.querySelector<HTMLElement>('[aria-current="page"]')?.parentElement;
    if (ul && li) ul.scrollLeft = Math.max(0, li.offsetLeft - 16);
  }, [activ]);

  return (
    <nav aria-label="Contul meu" className="-mx-4 mb-6 sm:-mx-6 lg:hidden">
      <ul
        ref={lista}
        className="flex gap-1 overflow-x-auto border-b border-[var(--st-border)] px-4 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {MENIU.map((m) => {
          const este = m.cheie === activ;
          const n = numere[m.cheie];
          return (
            <li key={m.cheie} className="shrink-0">
              <Link
                href={m.href}
                aria-current={este ? "page" : undefined}
                className={`-mb-px inline-flex h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${FOCUS} ${
                  este ? "font-semibold text-[var(--st-on-bg)]" : "border-transparent text-[var(--st-on-bg)] opacity-70 hover:opacity-100"
                }`}
                style={este ? { borderColor: "var(--st-primary)" } : undefined}
              >
                {m.scurt}
                {typeof n === "number" && n > 0 && (
                  <span className="text-xs tabular-nums opacity-70">{n}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
