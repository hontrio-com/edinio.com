"use client";

import { ArrowUpRight } from "lucide-react";
import { CapturaDerulata, useDerulareCaptura } from "@/components/teme/CapturaDerulata";
import type { TemaPeScurt } from "@/lib/teme/teme-pe-scurt";

/**
 * Galeria paginii „/teme” (16.11.2026). Cerut de el, pe rand: FARA rubrici si fara titlu de sectiune, „carduri premium
 * pentru fiecare tema, cate 4 pe rand”, apoi „cardurile mai mari si premium” si „sa se departa cumva sectiunea de HERO de
 * sectiunea cu temele”.
 *
 * DESPARTIREA: o banda a ei, ca celelalte sectiuni ale site-ului (linie fina sus, `py-20 lg:py-28`), pe un gri foarte
 * deschis (`bg-tint-2`), pe care cardurile albe ies in fata; hero-ul ramane alb.
 *
 * CARDUL (mai mare: galeria merge pana la 1600 px, 4 pe rand de la 1280 px, 3 sub): o „scena” deschisa, ca o fotografie de
 * produs, cu fereastra de browser a temei (captura se deruleaza pana jos cat tii mouse-ul pe card) si un telefon in colt,
 * cu aceeasi tema pe telefon, care se ridica putin la hover. Dupa cardurile in straturi (Texture Card, Cult UI) si cele
 * cu o imagine care se ridica la hover (Framer). Culoarea vine din capturi; cardul ramane alb si gri, fara fonduri
 * colorate si fara cercuri colorate (memoria „design fara vibe code”).
 *
 * Componenta de client doar pentru derulare; e randata si pe server, deci toate temele pleaca in HTML. Lista vine de la
 * pagina (de server): `TEME` intreaga n-are voie in pachet, de aceea tipul se importa doar ca TIP.
 */
export function GalerieTeme({ teme }: { teme: TemaPeScurt[] }) {
  return (
    <section id="teme" className="sub-bara border-t border-hairline bg-tint-2 py-20 lg:py-28">
      <div className="mx-auto max-w-[1600px] px-5 sm:px-6 lg:px-8">
        <h2 className="sr-only">Toate temele</h2>
        <ul role="list" className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-x-7 xl:gap-y-12">
          {teme.map((t) => (
            <CardTema key={t.cheie} tema={t} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** „https://jupiter.edinio.com” -> „jupiter.edinio.com”, pentru bara de adresa a ferestrei. */
function gazdaDemo(adresa: string): string {
  return adresa.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Cardul unei teme: tot cardul e legatura spre demo, intr-o fila noua. Eticheta legaturii spune tot (numele, pentru cine,
 * fila noua), deci cititoarele de ecran aud o singura data ce e, nu bara de adresa si capturile.
 */
function CardTema({ tema: t }: { tema: TemaPeScurt }) {
  const { derulata, evenimente } = useDerulareCaptura();
  return (
    <li>
      <a
        href={t.adresaDemo}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t.nume}: ${t.pentru}. Vezi demo-ul temei, într-o filă nouă`}
        {...evenimente}
        className="group/card block rounded-[28px] bg-white p-2 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-30px_rgba(15,23,42,0.3)] outline-none transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_2px_4px_rgba(15,23,42,0.05),0_36px_64px_-32px_rgba(15,23,42,0.42)] focus-visible:shadow-[0_0_0_2px_rgba(15,23,42,0.85)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        {/* Scena: fereastra temei pe un fond deschis, iesind prin marginea de jos, cu telefonul in fata ei, in colt. */}
        <div aria-hidden="true" className="relative aspect-[5/4] overflow-hidden rounded-[22px] bg-gradient-to-b from-stone-100 to-stone-50 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]">
          <div className="absolute bottom-0 left-[7%] right-[16%] top-[8%] flex flex-col overflow-hidden rounded-t-[12px] bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.07),0_18px_40px_-20px_rgba(15,23,42,0.35)]">
            <div className="flex shrink-0 items-center gap-1.5 border-b border-black/[0.06] bg-neutral-50 px-2.5 py-1.5">
              <span className="flex shrink-0 gap-1">
                <span className="h-[6px] w-[6px] rounded-full bg-neutral-300" />
                <span className="h-[6px] w-[6px] rounded-full bg-neutral-300" />
                <span className="h-[6px] w-[6px] rounded-full bg-neutral-300" />
              </span>
              <span className="min-w-0 flex-1 truncate rounded-[5px] bg-white px-1.5 py-px text-center text-[10px] text-ink-3 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]">
                {gazdaDemo(t.adresaDemo)}
              </span>
            </div>
            <div className="relative flex-1 overflow-hidden bg-tint-2">
              {t.captura ? <CapturaDerulata captura={t.captura} alt="" derulata={derulata} /> : null}
            </div>
          </div>

          {t.telefon ? (
            <div className="absolute bottom-[6%] right-[5%] w-[25%] transition-transform duration-500 ease-out group-hover/card:-translate-y-2 motion-reduce:transition-none motion-reduce:group-hover/card:translate-y-0">
              <div className="rounded-[18%/8.4%] bg-neutral-900 p-[4%] shadow-[0_0_0_1px_rgba(15,23,42,0.2),0_18px_36px_-14px_rgba(15,23,42,0.55)]">
                <div className="overflow-hidden rounded-[14%/6.6%] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.telefon.adresa} width={t.telefon.latime} height={t.telefon.inaltime} alt="" loading="lazy" decoding="async" className="block h-auto w-full" />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-start justify-between gap-4 px-3 pb-2.5 pt-4">
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{t.nume}</h3>
            <p className="mt-1 line-clamp-2 text-[13.5px] leading-[1.5] text-ink-2">{t.pentru}</p>
          </div>
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors duration-200 group-hover/card:border-ink group-hover/card:bg-ink group-hover/card:text-white"
          >
            Vezi demo <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </a>
    </li>
  );
}
