"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
  MENTENANTA_CARDURI,
  MENTENANTA_LEAD,
  MENTENANTA_TITLU,
} from "@/lib/website/mentenanta";
import { IlustratieMentenanta } from "./IlustratiiMentenanta";

/**
 * „Ce include" — patru file care se schimbă la trecerea cu mausul.
 *
 * Referință dată de client (o componentă Framer): la stânga o listă de titluri,
 * la dreapta un panou mare, iar cel activ se mută cu o animație fluentă. Cerută
 * cu o schimbare: în stânga DOAR titlurile, iar descrierea trece în dreapta,
 * lângă ilustrație.
 *
 * ═══ O SINGURĂ DESCRIERE ÎN PAGINĂ, NU PATRU ═══
 *
 * Panoul din dreapta arată descrierea filei ACTIVE. Cele patru texte nu stau
 * toate în DOM ascunse prin CSS: e tiparul obișnuit de file, și e și motivul
 * pentru care tabelul de comparație are un singur `<table>` — conținut scris de
 * două ori se desparte la prima corectură și e citit de două ori de cititoarele
 * de ecran.
 *
 * ═══ HOVER, DAR NU NUMAI ═══
 *
 * Clientul a cerut schimbarea la trecerea cu mausul. Hover-ul singur ar fi
 * închis secțiunea pentru cine folosește tastatura sau un ecran tactil, deci
 * fila se schimbă la `pointerenter` (numai de la maus), la `focus` și la
 * apăsare. Pe telefon rămâne apăsarea, care e oricum singurul lucru care există
 * acolo.
 *
 * ═══ MARCAJUL ALUNECĂ, NU CLIPEȘTE ═══
 *
 * Un singur dreptunghi în spatele listei, mutat cu `transform`, nu patru fundaluri
 * care se sting pe rând: așa se vede că e ACELAȘI lucru care se mută, ceea ce
 * leagă cele două stări. Poziția și înălțimea se MĂSOARĂ din butoane
 * (`useLayoutEffect`, înainte de vopsire, ca să nu treacă un cadru cu marcajul
 * în locul vechi) și se recitesc la redimensionare — titlurile se rup pe alt
 * număr de rânduri la lățimi diferite, deci înălțimile nu se pot scrie de mână.
 *
 * `prefers-reduced-motion` oprește alunecarea și estomparea; conținutul rămâne
 * întreg, doar că se schimbă instant.
 */

/* Durata trecerii. Aceeași pentru marcaj și pentru panou, ca să se citească drept
   o singură mișcare, nu două care se întrec. */
const DURATA_MS = 320;

export function SectiuneCeInclude() {
  const [activ, setActiv] = useState(0);
  const [marcaj, setMarcaj] = useState<{ top: number; height: number } | null>(null);
  const butoane = useRef<(HTMLButtonElement | null)[]>([]);

  /*
   * `useLayoutEffect`, nu `useEffect`: măsurarea trebuie făcută înainte ca
   * browserul să vopsească. Cu `useEffect`, la prima randare s-ar fi văzut un
   * cadru fără marcaj, iar la fiecare schimbare unul cu marcajul în locul vechi.
   * Pe server nu există layout, deci se folosește `useEffect` acolo — altfel
   * React avertizează la fiecare randare.
   */
  const useIzomorf = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIzomorf(() => {
    const masoara = () => {
      const el = butoane.current[activ];
      if (el) setMarcaj({ top: el.offsetTop, height: el.offsetHeight });
    };
    masoara();
    /* Titlurile se rup pe alt număr de rânduri la lățimi diferite, deci
       înălțimea marcajului se schimbă cu fereastra. */
    window.addEventListener("resize", masoara);
    return () => window.removeEventListener("resize", masoara);
  }, [activ]);

  const cardActiv = MENTENANTA_CARDURI[activ];

  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        {/*
          Capul secțiunii, identic cu al celorlalte: 32/44px, text 16/18px,
          `mt-5`. Când se schimbă unul, se schimbă toate — numai fiindcă arată
          identic se citesc ca o serie.
        */}
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            {MENTENANTA_TITLU}
          </h2>
          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {MENTENANTA_LEAD}
          </p>
        </div>

        {/*
          2/5 și 3/5: lista are patru titluri scurte, panoul are o descriere și o
          ilustrație. Sub `lg` se stivuiesc, cu lista PRIMA — ea e cuprinsul, iar
          un panou fără cuprinsul lui deasupra n-ar spune între ce alegi.
        */}
        {/*
          ⚠ `grid-cols-1` SCRIS EXPLICIT, nu lasat implicit.
          Fara el, sub `lg` grila n-are nicio pista definita, iar pista `auto` se
          dimensioneaza dupa CONTINUT, nu dupa container: pe 360px cele doua
          coloane ieseau de 304px intr-un ecran de 302 si toata pagina capata
          derulare laterala. Masurat. E aceeasi capcana ca in
          [[depasire-orizontala-mobil]], a doua oara in proiectul asta.

          `min-w-0` pe copii, din acelasi motiv: pe o pista de grila, latimea
          minima implicita e `auto`, adica un cuvant lung sau o ilustratie mai
          lata nu se lasa stramtata si impinge coloana in afara.
        */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:mt-16 lg:grid-cols-5 lg:items-start lg:gap-8">
          {/* ── Lista de titluri ────────────────────────────────────────── */}
          <div className="relative min-w-0 lg:col-span-2" role="tablist" aria-label={MENTENANTA_TITLU}>
            {/*
              Marcajul care alunecă. `aria-hidden`: e desen, iar starea aleasă e
              deja spusă de `aria-selected` pe buton.
            */}
            {marcaj ? (
              <span
                aria-hidden="true"
                className="absolute left-0 right-0 rounded-[12px] bg-tint motion-reduce:transition-none"
                style={{
                  transform: `translateY(${marcaj.top}px)`,
                  height: marcaj.height,
                  transition: `transform ${DURATA_MS}ms cubic-bezier(0.22,1,0.36,1), height ${DURATA_MS}ms cubic-bezier(0.22,1,0.36,1)`,
                }}
              />
            ) : null}

            {MENTENANTA_CARDURI.map((card, i) => (
              <button
                key={card.id}
                ref={(el) => { butoane.current[i] = el; }}
                type="button"
                role="tab"
                aria-selected={i === activ}
                aria-controls="panou-ce-include"
                /* Numai de la maus: pe ecran tactil `pointerenter` vine odată cu
                   apăsarea, deci s-ar fi executat de două ori. */
                onPointerEnter={(e) => { if (e.pointerType === "mouse") setActiv(i); }}
                onFocus={() => setActiv(i)}
                onClick={() => setActiv(i)}
                className={cn(
                  "relative block w-full rounded-[12px] px-5 py-4 text-left text-[19px] font-bold leading-[1.25] tracking-[-0.02em] transition-colors duration-200 sm:text-[22px]",
                  i === activ ? "text-ink" : "text-ink-3 hover:text-ink-2",
                )}
              >
                {card.titlu}
              </button>
            ))}
          </div>

          {/* ── Panoul din dreapta ──────────────────────────────────────── */}
          <div
            id="panou-ce-include"
            role="tabpanel"
            className="placa min-w-0 rounded-[16px] p-6 sm:p-8 lg:col-span-3"
          >
            {/*
              Cheia forțează React să înlocuiască blocul la fiecare schimbare,
              iar animația de intrare pornește de la capăt. Fără ea, textul s-ar
              schimba pe loc, fără nicio trecere.
            */}
            <div key={cardActiv.id} className="apare-lin">
              <p className="text-[16px] leading-[1.65] text-ink-2 sm:text-[17px]">
                {cardActiv.descriere}
              </p>

              {/* Ilustrația repetă exact ce scrie deasupra, deci nu se citește. */}
              <div aria-hidden="true" className="mt-7 flex justify-center">
                <IlustratieMentenanta id={cardActiv.id} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
