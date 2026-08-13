import { Gauge } from "@/components/ui/gauge-1";
import { SCORURI_PAGESPEED, culoareScor } from "@/lib/website/optimizare";

/**
 * Panoul cu rezultatele PageSpeed Insights, ca ilustrație a cardului „Încărcare
 * rapidă".
 *
 * ═══ CADRANELE SUNT CHIAR COMPONENTA CLIENTULUI ═══
 *
 * `components/ui/gauge-1.tsx`, copiată literal. Prima formă era o rescriere a
 * mea, mai ușoară; clientul a cerut de două ori componenta lui, deci asta e.
 * Ce trebuie știut despre ea — că aduce `framer-motion` și că pornește animația
 * la 100ms de la montare, nu când intră în ecran — e scris în capul fișierului
 * ei.
 *
 * Aici rămân doar așezarea și legătura cu datele.
 *
 * ═══ COMPONENTĂ DE SERVER ═══
 *
 * Panoul n-are nicio stare: cadranele își poartă singure animația, iar ele sunt
 * cele marcate `"use client"`. Deci tot restul — grila, eticheta fiecărui scor și
 * rândul citit de cititoarele de ecran — pleacă gata randat de pe server.
 */

/**
 * Mărimea cadranului, legată de lățimea panoului.
 *
 * ⚠ NU e o valoare fixă pe trepte de ecran, și asta a fost o corectură măsurată.
 * Înălțimea în care încap cadranele vine din ilustrația 4:3 a cardului, adică din
 * LĂȚIMEA CARDULUI — iar aceea sare exact la trecerea de prag, când grila mai
 * adaugă o coloană. Cu pixeli ficși pe trepte, la 320, 640 și 1024px conținutul
 * ieșea cu 8-18px peste marginea ilustrației: trei lățimi din nouăsprezece
 * încercate, toate fix după câte un prag.
 *
 * `size` al componentei primește `100%`, iar lățimea o dă învelișul, în procente
 * din panou (`cqw`). Plafonul de 86 e mărimea la care e desenată; sub 48 cifra
 * n-ar mai încăpea în inel.
 */
const MARIME_CADRAN = "w-[calc(37.5cqw-28px)] max-w-[86px] min-w-[48px]";

export function PanouPageSpeed() {
  return (
    /*
      Umple ilustrația 4:3 a cardului. Nu-și desenează propria casetă: fondul
      `tint` și colțurile de 11px sunt deja ale ilustrației, ca la „Problema".

      `@container`: cadranele se măsoară în procente din lățimea panoului. Vezi
      nota de la `MARIME_CADRAN`.
    */
    <div className="@container absolute inset-0 flex flex-col justify-center px-4 py-4 sm:px-5">
      {/*
        Scorurile ca TEXT, o singură dată, pentru cine ascultă pagina și pentru
        cine o indexează.

        ⚠ Fără rândul ăsta, cifrele există doar în cadrane — iar cadranele
        pornesc de la zero și urcă abia în browser, deci de pe server ar pleca
        patru zerouri și atât. Ce trimite serverul trebuie să spună adevărul
        singur.
      */}
      <p className="sr-only">
        Rezultate PageSpeed Insights, măsurate pe mobil:{" "}
        {SCORURI_PAGESPEED.map((s) => `${s.eticheta} ${s.scor} din 100`).join(", ")}.
      </p>

      <div className="mx-auto grid w-full max-w-[264px] grid-cols-2 gap-x-4 gap-y-3">
        {SCORURI_PAGESPEED.map((scor, i) => (
          <div key={scor.eticheta} className="flex flex-col items-center">
            {/*
              ⚠ Lățimea stă pe ÎNVELIȘUL cadranului, nu pe blocul întreg, și e o
              corectură măsurată: cu ea pe bloc, eticheta era strânsă la lățimea
              cercului, iar „Accesibilitate" se rupea pe două rânduri de îndată ce
              cercul cobora sub ~78px. Rândul în plus înălța tot panoul și îl
              scotea din ilustrație. Așa eticheta poate folosi toată coloana.

              `text-ink`: componenta desenează cifra cu `fill="currentColor"`.
            */}
            {/* `flex`: învelișul componentei e `inline-block`, iar un inline stă pe
                linia de bază — măsurat, rămâneau 8px de gol sub cadran, cât
                coborârea fontului. Ca element de flex, golul dispare. */}
            <div className={`${MARIME_CADRAN} flex text-ink`}>
              <Gauge
                value={scor.scor}
                size="100%"
                strokeWidth={9}
                gapPercent={4}
                gradient
                tickMarks
                /* Culoarea vine din pragurile uneltei, nu din `primary="success"`:
                   dacă un scor coboară vreodată sub 90, inelul trebuie să se
                   schimbe odată cu el. Vezi `culoareScor`. */
                primary={culoareScor(scor.scor)}
                /* Decalaj mic între ele, ca panoul să se completeze, nu să
                   pornească tot deodată. */
                transition={{ delay: i * 120 }}
              />
            </div>

            {/*
              Eticheta stă SUB cadran, nu în el. Componenta o poate desena
              înăuntru (`label`), dar acolo are 8 din 100 de unități — la un cadran
              de 58-86px iese de 5-7px, iar „Accesibilitate" ar fi o dâră. Aici e
              la 11px, unde se citește.
            */}
            <span className="mt-1.5 text-center text-[11px] leading-[1.25] text-ink-2 sm:text-[11.5px]">
              {scor.eticheta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
