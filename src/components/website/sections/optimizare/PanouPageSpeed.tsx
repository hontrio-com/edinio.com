"use client";

import { useEffect, useRef, useState } from "react";
import {
  SCORURI_PAGESPEED,
  arcOprit,
  culoareScor,
  pasArc,
} from "@/lib/website/optimizare";
import { Gauge } from "./Gauge";

/**
 * Panoul cu rezultatele PageSpeed Insights, ca ilustrație a cardului „Încărcare
 * rapidă".
 *
 * ═══ CE FACE JAVASCRIPT-UL DE AICI, ȘI CÂT ═══
 *
 * O singură buclă de cadre, pornită când panoul intră în ecran, care urcă toate
 * cele patru scoruri de la zero la valoarea lor. Atât. Fără bibliotecă de
 * animație: integratorul e o funcție pură din `lib/website/optimizare.ts`, cu
 * numerele arcului tot acolo — inclusiv motivul pentru care amortizarea NU e cea
 * din exemplul clientului (la 60, cadranele urcau 4,8 secunde; măsurat).
 *
 * ⚠ O SINGURĂ buclă pentru toate patru, nu câte una de cadran. Patru bucle
 * înseamnă patru observatori, patru stări și patru serii de cadre care se
 * trezesc la momente diferite — iar pe ecran s-ar fi văzut ca patru cadrane care
 * pornesc pe rând, din întâmplare, nu ca un panou care se completează.
 *
 * ⚠ Numerele PLEACĂ DE LA ZERO, deci HTML-ul trimis de server are patru zerouri
 * în cadrane. De aceea scorurile adevărate sunt scrise ȘI ca text, o dată, în
 * `sr-only`: aia e ce aude cine ascultă pagina și ce citește cine o indexează.
 * Fără rândul acela, tot ce pleca de pe server erau patru zerouri.
 *
 * Cu `prefers-reduced-motion` nu pornește nimic: scorurile se văd de la început,
 * întregi.
 */

export function PanouPageSpeed() {
  const gazda = useRef<HTMLDivElement>(null);
  const [aratate, setAratate] = useState<number[]>(() =>
    SCORURI_PAGESPEED.map(() => 0),
  );

  useEffect(() => {
    const el = gazda.current;
    if (!el) return;

    const tinte = SCORURI_PAGESPEED.map((s) => s.scor);

    const fara =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const deIndata = fara || typeof IntersectionObserver !== "function";

    let cadru = 0;
    let ultima = 0;
    /*
      Când nu se animă, arcurile PORNESC de pe valoarea finală. Așa primul cadru
      trece direct testul de oprire și scrie scorurile întregi, o singură dată.

      Alternativa evidentă — un `setAratate(tinte)` aici, în efect — e chiar ce
      interzice `react-hooks/set-state-in-effect`, și pe bună dreptate: ar fi
      însemnat o a doua randare imediat după prima, la fiecare montare.
    */
    const x = deIndata ? [...tinte] : tinte.map(() => 0);
    const viteza = tinte.map(() => 0);

    const pas = (acum: number) => {
      /* Pasul se plafonează în sus, ca o filă lăsată în fundal să nu se întoarcă
         cu un salt; și în jos la zero, fiindcă un `dt` negativ ar integra arcul
         înapoi în timp, iar în sensul ăla e instabil. */
      const dt =
        ultima === 0 ? 1 / 60 : Math.min(Math.max((acum - ultima) / 1000, 0), 1 / 30);
      ultima = acum;

      let inMiscare = false;
      for (let i = 0; i < tinte.length; i++) {
        /* Integratorul sta in `lib`, ca functie pura: `requestAnimationFrame` nu
           ruleaza intr-o fila de fundal, deci miscarea nu se poate proba din
           browser. Vezi `optimizare.test.ts`. */
        const dupa = pasArc(x[i], viteza[i], tinte[i], dt);
        x[i] = dupa.x;
        viteza[i] = dupa.viteza;
        if (arcOprit(x[i], viteza[i], tinte[i])) {
          x[i] = tinte[i];
          viteza[i] = 0;
        } else {
          inMiscare = true;
        }
      }
      setAratate([...x]);
      cadru = inMiscare ? requestAnimationFrame(pas) : 0;
    };

    const porneste = () => {
      if (cadru === 0) {
        ultima = 0;
        cadru = requestAnimationFrame(pas);
      }
    };

    if (deIndata) {
      porneste();
      return () => {
        if (cadru !== 0) cancelAnimationFrame(cadru);
      };
    }

    const observator = new IntersectionObserver(
      (intrari) => {
        if (!intrari.some((i) => i.isIntersecting)) return;
        /* O singură dată: panoul nu se reia la fiecare trecere prin dreptul lui.
           Un cadran care o ia de la zero de fiecare dată când derulezi înapoi e
           decor, nu informație. */
        observator.disconnect();
        porneste();
      },
      /* Pornește când s-a văzut un sfert din panou: mai devreme, animația s-ar
         termina înainte să ajungă omul cu ochii pe el. */
      { threshold: 0.25 },
    );
    observator.observe(el);

    return () => {
      observator.disconnect();
      if (cadru !== 0) cancelAnimationFrame(cadru);
    };
  }, []);

  return (
    /*
      Umple ilustrația 4:3 a cardului. Nu-și mai desenează propria casetă: fondul
      `tint` și colțurile de 11px sunt deja ale ilustrației, ca la „Problema".
    */
    <div
      ref={gazda}
      /* `@container`: cadranele se măsoară în procente din LĂȚIMEA PANOULUI. Vezi
         nota de la `className`-ul lor. */
      className="@container absolute inset-0 flex flex-col justify-center gap-3 px-4 py-4 sm:px-5"
    >
      {/*
        Scorurile ca TEXT, o singură dată, pentru cine ascultă pagina și pentru
        cine o indexează.

        ⚠ Fără rândul ăsta, cifrele există doar în cadrane — iar cadranele pornesc
        de la zero, deci de pe server ar pleca patru zerouri și atât. Animația se
        întâmplă abia în browser; ce trimite serverul trebuie să spună adevărul
        singur.
      */}
      <p className="sr-only">
        Rezultate PageSpeed Insights, măsurate pe mobil:{" "}
        {SCORURI_PAGESPEED.map((s) => `${s.eticheta} ${s.scor} din 100`).join(", ")}.
      </p>

      <div className="mx-auto grid w-full max-w-[264px] grid-cols-2 gap-x-4 gap-y-3">
        {SCORURI_PAGESPEED.map((scor, i) => (
          <Gauge
            key={scor.eticheta}
            aratat={aratate[i] ?? 0}
            eticheta={scor.eticheta}
            culoare={culoareScor(scor.scor)}
            /*
              ⚠ LĂȚIMEA CADRANULUI SE LEAGĂ DE LĂȚIMEA PANOULUI, nu de treptele
              de ecran, și asta a fost o corectură măsurată.

              Prima formă avea pixeli ficși pe trepte (86 / 74 / 86). Dar
              înălțimea în care încap cadranele vine din ilustrația 4:3 a
              cardului, adică din LĂȚIMEA CARDULUI — iar aceea sare exact la
              trecerea de treaptă, când grila mai adaugă o coloană. Rezultatul:
              la 360, 640 și 1024px conținutul ieșea cu 12-18px pe deasupra
              panoului. Trei lățimi din douăsprezece încercate, toate fix după
              câte un prag.

              Formula vine din măsurătoare: partea fixă a panoului (spațiere,
              etichete, rândul de jos) e ~68px, iar înălțimea utilă e 0,75 din
              lățime, deci cadranul poate fi cel mult `(0,75·L − 68) / 2`. În
              procente din panou, cu marginile scăzute, iese `37,5cqw − 28px`.
              Plafonul de 86 e mărimea desenată; sub 48 cifra n-ar mai încăpea.
            */
            className="w-[calc(37.5cqw-28px)] max-w-[86px] min-w-[48px] justify-self-center"
          />
        ))}
      </div>

      {/*
        Care unealtă și pe ce a fost măsurat. „Mobil", fiindcă acolo scorurile sunt
        mai mici — deci ăla e numărul onest; un panou care nu spune pe ce a rulat
        lasă cititorul să presupună desktop, unde e mai ușor.
      */}
      <p className="text-center text-[11px] leading-[1.3] text-ink-3">
        PageSpeed Insights · mobil
      </p>
    </div>
  );
}
