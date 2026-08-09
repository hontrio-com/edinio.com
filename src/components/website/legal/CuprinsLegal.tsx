"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { articolulActiv, type IntrareCuprins } from "@/lib/website/cuprins";

/**
 * Cuprinsul unui document juridic lung.
 *
 * ═══ O SINGURĂ LISTĂ ÎN DOM ═══
 *
 * Pe telefon e un panou care se deschide, pe desktop o coloană lipită care se
 * derulează singură. E ACELAȘI `<ul>`, nu două randări ascunse pe rând: la 50 de
 * intrări, a doua copie ar însemna 50 de linkuri în plus pentru cititoarele de
 * ecran și pentru motoarele de căutare, plus două locuri de ținut în acord.
 *
 * De aceea deschiderea se face din clase (`grid-rows-[0fr]` → `[1fr]`), cu
 * `lg:grid-rows-[1fr]` care o forțează deschisă pe ecrane mari — nu din stil
 * incorporat, care ar bate clasa și ar ține panoul închis pe desktop.
 *
 * ═══ CE SE VEDE, SE ȘTIE ═══
 *
 * `IntersectionObserver` marchează articolul din dreptul ecranului. Alternativa
 * (citit `getBoundingClientRect()` la fiecare derulare) cere 50 de măsurători pe
 * cadru și obligă browserul să recalculeze aranjarea exact când omul derulează.
 *
 * ⚠ `rootMargin` taie 70% de jos: fără el, la un articol scurt sunt vizibile
 * patru deodată și cuprinsul clipește între ele. Așa rămâne aprins primul care
 * intră în treimea de sus — adică cel pe care omul chiar îl citește.
 */

export type { IntrareCuprins };

export function CuprinsLegal({ intrari }: { intrari: IntrareCuprins[] }) {
  const [activ, setActiv] = useState<string | null>(null);
  const [deschis, setDeschis] = useState(false);
  const listaRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const sectiuni = intrari
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!sectiuni.length) return;

    const vizibile = new Set<string>();
    const observator = new IntersectionObserver(
      (intrariObs) => {
        for (const intrare of intrariObs) {
          if (intrare.isIntersecting) vizibile.add(intrare.target.id);
          else vizibile.delete(intrare.target.id);
        }
        const primul = articolulActiv(intrari, vizibile);
        if (primul) setActiv(primul);
      },
      { rootMargin: "-88px 0px -70% 0px", threshold: 0 },
    );

    sectiuni.forEach((s) => observator.observe(s));
    return () => observator.disconnect();
  }, [intrari]);

  /* Cuprinsul se derulează singur după articolul activ. Nu `scrollIntoView`:
     acela urcă la primul strămoș derulabil, care poate fi chiar PAGINA, și ar
     smuci documentul sub degetul omului. */
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista || !activ) return;
    const link = lista.querySelector<HTMLElement>(`[data-id="${activ}"]`);
    if (!link) return;

    const sus = link.offsetTop;
    const jos = sus + link.offsetHeight;
    if (sus < lista.scrollTop) lista.scrollTop = sus - 8;
    else if (jos > lista.scrollTop + lista.clientHeight) {
      lista.scrollTop = jos - lista.clientHeight + 8;
    }
  }, [activ]);

  return (
    /*
      `self-start` NU e cosmetic: un element de grilă se întinde din oficiu pe
      toată înălțimea rândului, iar atunci `sticky` n-are pe ce să alunece și
      coloana stă pur și simplu pe loc.

      `print:hidden`: documentul spune că poate fi salvat și reprodus, iar la
      tipărire un cuprins cu 50 de linkuri e o pagină irosită.
    */
    <nav
      aria-labelledby="cuprins-titlu"
      className="print:hidden lg:sticky lg:top-24 lg:self-start"
    >
      {/*
        Pe desktop e un titlu obișnuit; pe telefon, același element e butonul
        care deschide panoul. `aria-expanded` lipsește dinadins peste `lg`:
        acolo nu se mai deschide nimic, panoul e mereu la vedere.
      */}
      <button
        type="button"
        onClick={() => setDeschis((d) => !d)}
        aria-expanded={deschis}
        aria-controls="cuprins-panou"
        className="flex w-full items-center justify-between gap-3 rounded-[8px] border border-hairline px-4 py-3 text-left transition-colors hover:bg-tint lg:pointer-events-none lg:border-0 lg:px-0 lg:py-0 lg:hover:bg-transparent"
      >
        <span
          id="cuprins-titlu"
          className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3"
        >
          Cuprins
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 lg:hidden",
            deschis && "rotate-180",
          )}
        />
      </button>

      <div
        id="cuprins-panou"
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out lg:grid-rows-[1fr]",
          deschis ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <ul
            ref={listaRef}
            className="mt-3 space-y-0.5 lg:mt-4 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-2"
          >
            {intrari.map((intrare) => {
              const esteActiv = activ === intrare.id;
              return (
                <li key={intrare.id}>
                  <a
                    href={`#${intrare.id}`}
                    data-id={intrare.id}
                    onClick={() => setDeschis(false)}
                    aria-current={esteActiv ? "true" : undefined}
                    className={cn(
                      "flex gap-2.5 rounded-[6px] px-2 py-1.5 text-[13px] leading-[1.45] transition-colors",
                      esteActiv
                        ? "bg-tint font-medium text-ink"
                        : "text-ink-2 hover:bg-tint hover:text-ink",
                    )}
                  >
                    {/* Lățime fixă: altfel titlurile pornesc din alt loc de la
                        articolul 10 încolo și marginea stângă iese zimțată. */}
                    <span
                      className={cn(
                        "w-[18px] shrink-0 tabular-nums text-right",
                        esteActiv ? "text-ink-2" : "text-ink-3",
                      )}
                    >
                      {intrare.nr}
                    </span>
                    <span>{intrare.titlu}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
