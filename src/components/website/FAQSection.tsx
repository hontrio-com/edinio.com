"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { FAQS, FAQ_LEAD, FAQ_TITLE, type FaqItem } from "@/lib/website/faq";

/**
 * Întrebările frecvente, în limbajul vizual al site-ului refăcut.
 *
 * ═══ O PLACĂ, NU ZECE CARDURI ═══
 *
 * Erau zece casete cu chenar, una sub alta, cu spațiu între ele. La șase
 * întrebări trecea; la zece, pagina se umple de dreptunghiuri și lista se
 * citește ca un teanc de formulare.
 *
 * Acum e o singură placă albă, ridicată de pe pagină prin aceeași umbră ca la
 * casetele de la Integrări și ca la tabelul de comparație, iar întrebările sunt
 * despărțite doar prin linii subțiri. Se citește ca UN lucru cu zece rânduri,
 * nu ca zece lucruri.
 *
 * ═══ DESCHIDEREA SE ANIMEAZĂ FĂRĂ SĂ MĂSOARE NIMIC ═══
 *
 * Înălțimea unui răspuns nu se știe dinainte, iar `height: auto` nu se poate
 * anima. Trucul e `grid-template-rows: 0fr → 1fr` pe un înveliș cu
 * `overflow: hidden` — singurul mod de a anima o înălțime necunoscută fără
 * JavaScript care măsoară. Același tipar ca la firul de mesaje din „Problema".
 *
 * Alternativa (măsurat `scrollHeight` și animat în pixeli) cere o citire de
 * aranjare la fiecare deschidere și se strică la redimensionare sau când fontul
 * se încarcă mai târziu.
 *
 * ═══ SEMNUL SE ROTEȘTE, NU SE SCHIMBĂ ═══
 *
 * Un plus care devine minus prin rotire cu 45° e un singur element care se
 * mișcă; două iconițe schimbate între ele clipesc. Rotirea spune și în ce
 * direcție merge acțiunea.
 *
 * ⚠ Textul de aici e ȘI sursa datelor structurate `FAQPage` trimise către
 * Google — vezi `lib/website/faq.ts`. Nu-l rescrie doar aici.
 */

const DESCHIDERE_MS = 260;

export function FAQSection() {
  const [deschis, setDeschis] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            {FAQ_TITLE}
          </h2>
          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {FAQ_LEAD}
          </p>
        </div>

        <div className="placa mx-auto mt-12 max-w-[820px] overflow-hidden rounded-[16px] lg:mt-16">
          {FAQS.map((faq, i) => (
            <Intrebare
              key={faq.question}
              faq={faq}
              deschisa={deschis === i}
              /* Una singură deschisă: cu zece răspunsuri lungi deschise deodată,
                 rândul căutat ajunge la câteva ecrane distanță de titlu. */
              onToggle={() => setDeschis(deschis === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Intrebare({
  faq,
  deschisa,
  onToggle,
}: {
  faq: FaqItem;
  deschisa: boolean;
  onToggle: () => void;
}) {
  /* `useId` și nu indicele: două secțiuni de întrebări pe aceeași pagină (start
     și `/preturi` o au amândouă) ar produce altfel id-uri duplicate, iar
     `aria-controls` ar trimite spre panoul greșit. */
  const idPanou = useId();

  return (
    <div className="border-t border-hairline first:border-t-0">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={deschisa}
          aria-controls={idPanou}
          className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-tint sm:px-6 sm:py-5"
        >
          <span
            className={cn(
              "text-[15px] font-semibold leading-[1.4] tracking-[-0.01em] transition-colors sm:text-[16px]",
              deschisa ? "text-ink" : "text-ink",
            )}
          >
            {faq.question}
          </span>
          {/*
            `mt-[3px]`: semnul se aliniază cu PRIMA linie a întrebării, nu cu
            mijlocul ei. La o întrebare care se rupe pe două rânduri, un semn
            centrat plutește în dreptul spațiului dintre ele.
          */}
          <Plus
            aria-hidden="true"
            strokeWidth={2}
            className={cn(
              "mt-[3px] h-[18px] w-[18px] shrink-0 text-ink-3 transition-transform duration-200",
              deschisa && "rotate-45",
            )}
          />
        </button>
      </h3>

      {/*
        Învelișul care se deschide. `grid-template-rows` merge de la `0fr` la
        `1fr`, iar copilul are `overflow: hidden` — așa se animează o înălțime pe
        care n-o știe nimeni dinainte.
      */}
      <div
        id={idPanou}
        role="region"
        className="grid transition-[grid-template-rows] ease-out"
        style={{
          gridTemplateRows: deschisa ? "1fr" : "0fr",
          transitionDuration: `${DESCHIDERE_MS}ms`,
        }}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-[14.5px] leading-[1.65] text-ink-2 sm:px-6 sm:pb-6">
            {faq.answer}
          </p>
        </div>
      </div>
    </div>
  );
}
