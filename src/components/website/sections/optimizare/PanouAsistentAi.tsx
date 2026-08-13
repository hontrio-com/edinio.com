"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import {
  ASISTENTI_TEANC,
  BARA,
  BUTON_PRODUS,
  INTREBARE,
  RASPUNS,
  SUBTEXT_CAMP,
  SURSA,
  recomandate,
  type Pictograma,
} from "@/lib/website/geo";

/**
 * Semnele din bara laterală.
 *
 * ⚠ SUNT DESENATE, NU LUATE DINTR-O BIBLIOTECĂ. Patru căi scurte cântăresc mai
 * puțin decât un pachet de pictograme adus pentru patru semne, iar la 13px
 * oricum nu se vede diferența.
 *
 * ⚠ Prima formă N-AVEA NICIUNUL: în locul lor rămăsese un pătrat gol cu chenar,
 * un substituent uitat, care pe ecran arăta ca o listă de căsuțe de bifat.
 */
const SEMNE: Record<Pictograma, string> = {
  biblioteca:
    "M4 6H2v14a2 2 0 0 0 2 2h14v-2H4zm16-4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2m-1 9H9V9h10zm-4 4H9v-2h6zm4-8H9V5h10z",
  proiecte: "M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8z",
  programate:
    "M11.99 2A10 10 0 1 0 22 12 10 10 0 0 0 11.99 2M12 20a8 8 0 1 1 8-8 8 8 0 0 1-8 8m.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  cont: "M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5m0 2c-3.34 0-10 1.67-10 5v3h20v-3c0-3.33-6.66-5-10-5",
};

function Semn({ nume, marime = 13 }: { nume: Pictograma; marime?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="shrink-0 fill-[#6b6b70]"
      style={{ width: marime, height: marime }}
    >
      <path d={SEMNE[nume]} />
    </svg>
  );
}

/**
 * Fereastra de discuție cu un asistent AI, ilustrația secțiunii „GEO".
 *
 * ═══ AȘEZAREA E A PAGINII DIN CAPTURA CLIENTULUI ═══
 *
 * Bară laterală la stânga — „Discuție nouă", meniul, „Recente", contul jos — și
 * la dreapta discuția, cu câmpul de întrebare pe fundul ferestrei. Întrebarea la
 * dreapta în pastilă, răspunsul la stânga fără pastilă: mesajul tău e o replică,
 * răspunsul lui e o pagină.
 *
 * ⚠ FEREASTRA NU POARTĂ NUMELE NIMĂNUI. Clientul a cerut și desenul paginii lor,
 * și trei sigle în locul semnului asistentului. Al doilea îl lămurește pe primul:
 * se împrumută așezarea, nu numele. Vezi nota de la `BARA` în `geo.ts`.
 *
 * ═══ SCRIEREA ═══
 *
 * Când panoul intră în ecran, întrebarea se scrie literă cu literă ÎN CÂMPUL DE
 * JOS, apoi urcă în discuție ca pastilă, iar răspunsul vine pe bucăți: sfatul,
 * produsele, încheierea. Ordinea aia e chiar rostul desenului — întâi întrebi,
 * pe urmă ești sfătuit, și abia apoi apare magazinul.
 *
 * ⚠ TOTUL PLEACĂ GOL DIN HTML: câmpul e gol, discuția n-are niciun rând. De aceea
 * întrebarea și răspunsul sunt scrise o dată ca text, în `sr-only` — aia se aude
 * și aia se indexează. Fără rândul acela, ce trimite serverul ar fi o fereastră
 * goală. Aceeași grijă ca la căutarea Google din secțiunea SEO.
 *
 * Cu `prefers-reduced-motion` nu se scrie nimic: discuția se vede întreagă de la
 * început.
 */

/* Cât stă între două litere. La 62 de semne iese cam două secunde și jumătate. */
const PAS_LITERA = 38;

/**
 * Treptele discuției. Numerele sunt cât se așteaptă DUPĂ treapta dinainte.
 *
 * ⚠ Pauza de „se gândește" nu e de fițe: fără ea, răspunsul apare în aceeași
 * clipă cu întrebarea și nu se mai citește ca un răspuns, ci ca un text care era
 * deja acolo.
 */
const TREPTE = [
  { pas: 1, dupa: 380 }, // întrebarea urcă în discuție
  { pas: 2, dupa: 420 }, // punctele de „se gândește"
  { pas: 3, dupa: 900 }, // sfatul
  { pas: 4, dupa: 620 }, // rândul spre magazin și produsele
  { pas: 5, dupa: 900 }, // încheierea și sursa
] as const;

export function PanouAsistentAi() {
  const gazda = useRef<HTMLDivElement>(null);
  const produse = recomandate();

  /* Pleacă goală: desenul are sens doar în ordinea „întâi întrebi, apoi ți se
     răspunde". */
  const [scris, setScris] = useState("");
  const [pas, setPas] = useState(0);

  useEffect(() => {
    const el = gazda.current;
    if (!el) return;

    const fara =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ceasuri: ReturnType<typeof setTimeout>[] = [];

    const porneste = () => {
      if (fara) {
        setScris("");
        setPas(5);
        return;
      }

      for (let i = 1; i <= INTREBARE.length; i++) {
        ceasuri.push(setTimeout(() => setScris(INTREBARE.slice(0, i)), i * PAS_LITERA));
      }

      let cand = INTREBARE.length * PAS_LITERA;
      for (const treapta of TREPTE) {
        cand += treapta.dupa;
        const { pas: n } = treapta;
        ceasuri.push(
          setTimeout(() => {
            /* Câmpul se golește chiar când întrebarea urcă în discuție, ca la
               trimiterea adevărată. */
            if (n === 1) setScris("");
            setPas(n);
          }, cand),
        );
      }
    };

    const observator = new IntersectionObserver(
      (intrari) => {
        for (const intrare of intrari) {
          if (!intrare.isIntersecting) continue;
          observator.disconnect();
          porneste();
        }
      },
      { threshold: 0.25 },
    );

    observator.observe(el);

    return () => {
      observator.disconnect();
      for (const ceas of ceasuri) clearTimeout(ceas);
    };
  }, []);

  return (
    <div ref={gazda} className="@container">
      <p className="sr-only">
        Exemplu de discuție cu un asistent AI. Întrebare: „{INTREBARE}&rdquo;
        Răspuns: {RASPUNS.sfat} {RASPUNS.spreMagazin}{" "}
        {produse.map((p) => `${p.produs.nume}, ${p.produs.pret}`).join("; ")}.{" "}
        {RASPUNS.incheiere} Sursa: {SURSA}.
      </p>

      <div
        aria-hidden="true"
        className="flex overflow-hidden rounded-[16px] border border-hairline bg-white"
      >
        <BaraLaterala />

        {/* ── Discuția ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-[300px] flex-1 flex-col gap-4 p-4 @[560px]:min-h-[360px] @[560px]:gap-5 @[560px]:p-6">
            {/* Întrebarea, la dreapta */}
            <div
              className="flex justify-end transition-opacity duration-300"
              style={{ opacity: pas >= 1 ? 1 : 0 }}
            >
              <p className="max-w-[85%] rounded-[18px] bg-[#f4f4f5] px-4 py-[10px] text-[13.5px] leading-[1.5] text-[#1f1f22] @[560px]:text-[15px]">
                {INTREBARE}
              </p>
            </div>

            {/* Răspunsul, la stânga */}
            <div
              className="flex gap-3 transition-opacity duration-300"
              style={{ opacity: pas >= 2 ? 1 : 0 }}
            >
              <TeancDeSigle />

              <div className="min-w-0 flex-1">
                {pas === 2 ? <Puncte /> : null}

                {pas >= 3 ? (
                  <p className="text-[13.5px] leading-[1.65] text-[#1f1f22] @[560px]:text-[15px]">
                    {RASPUNS.sfat}
                  </p>
                ) : null}

                {pas >= 4 ? (
                  <>
                    <p className="mt-3 text-[13.5px] leading-[1.65] text-[#1f1f22] @[560px]:text-[15px]">
                      {RASPUNS.spreMagazin}
                    </p>

                    <div className="mt-3 flex flex-col gap-2">
                      {produse.map(({ produs, insusiri }, i) => (
                        <RandProdus
                          key={produs.imagine}
                          nume={produs.nume}
                          pret={produs.pret}
                          imagine={produs.imagine}
                          insusiri={insusiri}
                          intarziere={i * 120}
                        />
                      ))}
                    </div>
                  </>
                ) : null}

                {pas >= 5 ? (
                  <>
                    <p className="mt-3 text-[13.5px] leading-[1.65] text-[#1f1f22] @[560px]:text-[15px]">
                      {RASPUNS.incheiere}
                    </p>

                    {/*
                      Pastila de sursă — chiar lucrul despre care e secțiunea: un
                      asistent care răspunde din paginile magazinului SPUNE de
                      unde a luat. Fără ea, ar părea că recomandă din senin.
                    */}
                    <span className="mt-4 inline-flex max-w-full items-center gap-[6px] rounded-full border border-hairline px-[10px] py-[5px]">
                      <svg viewBox="0 0 24 24" className="h-[11px] w-[11px] shrink-0 fill-[#6b6b70]">
                        <path d="M3.9 12a5.1 5.1 0 0 1 5.1-5.1h3V5H9a7 7 0 0 0 0 14h3v-1.9H9A5.1 5.1 0 0 1 3.9 12M8 13h8v-2H8zm7-8h-3v1.9h3a5.1 5.1 0 0 1 0 10.2h-3V19h3a7 7 0 0 0 0-14" />
                      </svg>
                      <span className="truncate text-[11px] leading-none text-[#6b6b70] @[560px]:text-[12px]">
                        {SURSA}
                      </span>
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <CampDeIntrebare text={scris} />
        </div>
      </div>
    </div>
  );
}

/**
 * Bara laterală.
 *
 * ⚠ SE VEDE ABIA DE LA 560px AI PANOULUI. Sub atât, fereastra rămâne doar
 * discuția — exact ce face și originalul pe telefon, unde bara stă ascunsă în
 * spatele unui buton. Ținută, ar fi mâncat jumătate din lățimea în care trebuie
 * să încapă un răspuns cu produse.
 */
function BaraLaterala() {
  return (
    <div className="hidden w-[188px] shrink-0 flex-col border-r border-hairline bg-[#f9f9f9] p-3 @[560px]:flex">
      <div className="flex items-center justify-between px-1 pb-3">
        <span className="text-[13px] font-semibold text-[#1f1f22]">{BARA.titlu}</span>
        <svg viewBox="0 0 24 24" className="h-[14px] w-[14px] fill-[#8e8e93]">
          <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.49 4.49 0 0 1 9.5 14" />
        </svg>
      </div>

      {/* Rândul de sus, cel scos în față. */}
      <span className="flex items-center gap-2 rounded-lg bg-[#ececec] px-2 py-[7px] text-[12.5px] text-[#1f1f22]">
        <svg viewBox="0 0 24 24" className="h-[13px] w-[13px] shrink-0 fill-[#1f1f22]">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z" />
        </svg>
        {BARA.intrebareNoua}
      </span>

      <span className="mt-1 flex flex-col">
        {BARA.meniu.map((element) => (
          <span
            key={element.eticheta}
            className="flex items-center gap-2 rounded-lg px-2 py-[7px] text-[12.5px] text-[#4b4b50]"
          >
            <Semn nume={element.pictograma} />
            {element.eticheta}
          </span>
        ))}
      </span>

      <span className="mt-4 px-2 pb-1 text-[11px] font-medium text-[#8e8e93]">
        {BARA.recenteTitlu}
      </span>

      <span className="flex min-h-0 flex-1 flex-col gap-[1px] overflow-hidden">
        {BARA.recente.map((titlu, i) => (
          <span
            key={titlu}
            className={cn(
              "truncate rounded-lg px-2 py-[6px] text-[12px]",
              i === 0 ? "bg-[#ececec] text-[#1f1f22]" : "text-[#4b4b50]",
            )}
          >
            {titlu}
          </span>
        ))}
      </span>

      <span className="mt-3 flex items-center gap-2 border-t border-hairline px-1 pt-3">
        {/* Bulina contului, cu semnul unui om în ea — nu un cerc gol. */}
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#ececec]">
          <Semn nume="cont" marime={12} />
        </span>
        <span className="truncate text-[12px] text-[#4b4b50]">{BARA.cont}</span>
      </span>
    </div>
  );
}

/**
 * Câmpul de întrebare, pe fundul ferestrei.
 *
 * Aici se scrie întrebarea literă cu literă, cu un cursor care clipește. După ce
 * „se trimite", rămâne gol, cu subtextul lui — ca după orice mesaj trimis.
 */
function CampDeIntrebare({ text }: { text: string }) {
  const gol = text.length === 0;

  return (
    <div className="px-4 pb-4 @[560px]:px-6 @[560px]:pb-6">
      {/*
        ⚠ CÂMPUL CREȘTE ÎN ÎNĂLȚIME, NU TAIE TEXTUL.

        Era `truncate`, și pe telefon se vedea doar începutul întrebării: se
        scriau șaizeci și două de semne, iar din ele încăpeau vreo douăzeci. Adică
        tocmai scrierea, singurul lucru care mișcă în desen, se oprea după o
        treime.

        Un câmp de întrebare adevărat face exact asta — se înalță pe măsură ce
        scrii — deci reparația e și mai aproape de original decât ce era.

        `items-end` ține semnele lipite de fundul câmpului când textul trece pe
        mai multe rânduri, ca la ei; iar rotunjirea e dată în pixeli, nu
        `rounded-full`: la un câmp înalt de trei rânduri, `full` l-ar fi făcut
        oval.
      */}
      <div className="flex items-end gap-2 rounded-[20px] border border-hairline px-3 py-[9px] @[560px]:px-4 @[560px]:py-[11px]">
        <svg viewBox="0 0 24 24" className="mb-[3px] h-[15px] w-[15px] shrink-0 fill-[#8e8e93]">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />
        </svg>

        <span className="min-w-0 flex-1 break-words text-[13px] leading-[1.4] @[560px]:text-[14.5px]">
          {gol ? (
            <span className="text-[#8e8e93]">{SUBTEXT_CAMP}</span>
          ) : (
            <span className="text-[#1f1f22]">
              {text}
              {/* Cursorul. Clipește doar cât se scrie. */}
              <span className="ml-[1px] inline-block h-[1em] w-[1.5px] translate-y-[2px] animate-pulse bg-[#1f1f22]" />
            </span>
          )}
        </span>

        {/* Butonul de trimitere, negru și rotund, ca la ei. */}
        <span className="mb-[-1px] flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[#1f1f22] @[560px]:h-[26px] @[560px]:w-[26px]">
          <svg viewBox="0 0 24 24" className="h-[13px] w-[13px] fill-white">
            <path d="M12 4l7 7-1.41 1.41L13 7.83V20h-2V7.83l-4.59 4.58L5 11z" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/**
 * Cele trei sigle, încălecate, în locul unde stă de obicei semnul asistentului.
 *
 * ⚠ SE VEDE EXACT JUMĂTATE DIN FIECARE, fiindcă marginea negativă e chiar
 * jumătate din diametru. Nu e o potriveală din ochi: la orice altă valoare, teancul
 * ori se desface, ori acoperă siglele de dedesubt cu totul, și atunci n-ar mai
 * spune „toți trei", ci „unul, cu ceva în spate".
 *
 * Prima siglă stă DEASUPRA, deci `z-index` scade cu poziția — altfel ultima ar
 * acoperi-o pe prima și teancul ar arăta întors pe dos față de cum se citește.
 */
function TeancDeSigle() {
  const diametru = 26;

  return (
    <span className="flex shrink-0 items-center pt-[2px]">
      {ASISTENTI_TEANC.map((asistent, i) => (
        <span
          key={asistent.nume}
          className="relative flex items-center justify-center rounded-full border border-hairline bg-white"
          style={{
            height: diametru,
            width: diametru,
            marginLeft: i === 0 ? 0 : -diametru / 2,
            zIndex: ASISTENTI_TEANC.length - i,
          }}
        >
          <Image
            src={asistent.src}
            alt=""
            width={Math.round(14 * asistent.raport)}
            height={14}
            unoptimized
            className="object-contain"
          />
        </span>
      ))}
    </span>
  );
}

/** Punctele de „se gândește", cât ține pauza dinaintea răspunsului. */
function Puncte() {
  return (
    <span className="flex items-center gap-[5px] py-[6px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block h-[6px] w-[6px] animate-pulse rounded-full bg-[#c7c7cc]"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

function RandProdus({
  nume,
  pret,
  imagine,
  insusiri,
  intarziere,
}: {
  nume: string;
  pret: string;
  imagine: string;
  insusiri: readonly string[];
  intarziere: number;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-[12px] border border-hairline p-[10px] duration-500 ease-out animate-in fade-in slide-in-from-bottom-2"
      style={{ animationDelay: `${intarziere}ms`, animationFillMode: "backwards" }}
    >
      <span className="relative block h-[42px] w-[42px] shrink-0 @[560px]:h-[48px] @[560px]:w-[48px]">
        <Image src={imagine} alt="" fill sizes="48px" unoptimized className="object-contain" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium leading-[1.35] text-[#1f1f22] @[560px]:text-[13.5px]">
          {nume}
        </span>
        <span className="mt-[3px] block truncate text-[11px] leading-[1.35] text-[#6b6b70] @[560px]:text-[12px]">
          {insusiri.join(" · ")}
        </span>
      </span>

      {/*
        Prețul și butonul, unul sub altul. Cerut de client: „la produse acolo să
        fie și un buton". Stau în coloană fiindcă pe panoul îngust n-ar fi încăput
        unul lângă altul, iar butonul e lucrul care nu are voie să se strângă.
      */}
      <span className="flex shrink-0 flex-col items-end gap-[6px]">
        <span className="text-[12.5px] font-semibold leading-none text-[#1f1f22] @[560px]:text-[13.5px]">
          {pret}
        </span>
        <span className="rounded-full bg-[#1f1f22] px-[10px] py-[5px] text-[10.5px] leading-none font-medium whitespace-nowrap text-white @[560px]:text-[11.5px]">
          {BUTON_PRODUS}
        </span>
      </span>
    </div>
  );
}
