"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { SCORURI_PAGESPEED, culoareScor } from "@/lib/website/optimizare";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CADRANELE SE ADUC DE PE REȚEA ABIA CÂND OMUL SE APROPIE DE ELE
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTĂ FIȘIERUL ĂSTA, ȘI DE CE `dynamic()` NU POATE STA ÎN
  `PanouPageSpeed.tsx`. Acela e componentă de SERVER, iar documentația lui Next
  (`docs/01-app/02-guides/lazy-loading.md`) spune două lucruri care lovesc exact
  aici:

    „When a Server Component dynamically imports a Client Component, automatic
     code splitting is currently not supported."
    „`ssr: false` is not allowed with `next/dynamic` in Server Components."

  Prima e cea periculoasă: un `dynamic()` pus acolo ar trece de build, ar arăta
  ca o optimizare și n-ar despica NIMIC. Zero octeți economisiți, măsurătoare
  neschimbată, și nimeni n-ar băga de seamă. De asta învelișul are „use client",
  iar `cadrane-la-intrare.test.ts` apără chiar asta.

  ⚠ CE SE CÂȘTIGĂ, MĂSURAT PE BIȚI (01.09.2026, simulat pe chunkurile reale):

      acum    610.172 bruți / 189.248 gzip / 164.327 brotli
      după    575.569        / 176.033      / 152.324
      delta    34.603        /  13.215      /  12.003   = 7,30% din rută

  Pleacă felia de arcuri a lui `framer-motion` (26.960 bruți, chunk întreg) plus
  modulul `Gauge` (7.642 minificați). ⚠ NU pleacă chunkul MARE al lui
  framer-motion (102.557) — ăla n-a fost niciodată pe /optimizare; Turbopack l-a
  scuturat corect. Cadranul trage doar `useMotionValue`/`useSpring`.

  ⚠ ȘI SE ADAUGĂ CEVA, ca să fie socoteala întreagă: `SCORURI_PAGESPEED`,
  `culoareScor` și pragurile lor trec acum în pachetul de client (~300 octeți
  bruți). Azi nu sunt acolo — verificat, `optimizare.ts` e scuturat pe export.

  ⚠ CE NU SE PIERDE. Cifrele adevărate NU erau niciodată în cadrane la randarea
  de pe server: acolo pleacă patru zerouri (`stroke-dasharray: 0, 285.885`), iar
  numerele stau într-un `<p className="sr-only">` scris de `PanouPageSpeed`, care
  rămâne componentă de server. Deci `ssr: false` scoate din HTML patru zerouri
  MINCINOASE — text adevărat în arborele de accesibilitate, pe un `<svg>` fără
  `role` și fără `aria-hidden`. E o îmbunătățire, nu o pierdere.

  ⚠ FĂRĂ JAVASCRIPT se văd acum patru pătrate goale în loc de patru piste cu „0"
  în ele. Amândouă sunt la fel de puțin lămuritoare, iar adevărul îl poartă
  oricum rândul `sr-only`.
*/

/* Aceeași valoare ca `MARIME_CADRAN` din `PanouPageSpeed.tsx`. */
const MARIME_CADRAN = "w-[calc(37.5cqw-28px)] max-w-[86px] min-w-[48px]";

/*
  ⚠ `aspect-square`, NU o înălțime fixă. SVG-ul componentei are `viewBox
  "0 0 100 100"` și `width`/`height` 100%, deci iese pătrat — măsurat 86,0×86,0
  px pe producție.

  Fără locul ăsta ținut, grila panoului cade de la 224,75 la 52,75 px și cele
  patru etichete sar pe verticală. Măsurat în browser, în toate trei variantele.
  Cu el: 224,75 px la zecimală, adică exact cât acum.

  ⚠ Saltul NU e CLS de pagină — ilustrația e `aspect-[4/3]` iar panoul
  `absolute inset-0`, deci pagina rămâne 5764 px oricum. Se apără ce se vede
  înăuntru, nu o măsurătoare Core Web Vitals.
*/
const LOC_TINUT = <div className="aspect-square w-full" />;

const Gauge = dynamic(() => import("@/components/ui/gauge-1").then((m) => m.Gauge), {
  ssr: false,
  loading: () => LOC_TINUT,
});

export function CadraneLaIntrare() {
  const gazda = useRef<HTMLDivElement>(null);

  /*
    ⚠ VALOAREA DE PORNIRE SE CALCULEAZĂ AICI, nu într-un efect. Prima formă avea
    `if (typeof IntersectionObserver === "undefined") setAratam(true)` în efect
    și pica la `react-hooks/set-state-in-effect`, regulă pornită pe eroare în
    proiect — chiar regula pentru care `gauge-1.tsx` are un `eslint-disable` în
    cap, și motivul pentru care `LaIntrareInEcran` scrie în comentariu că nu ține
    nicio stare React.

    Pe server `IntersectionObserver` lipsește → `aratam` pornește `true`, dar
    `ssr: false` randează oricum `LOC_TINUT`. Pe client cu observator → `false`,
    tot `LOC_TINUT`. Aceeași ieșire în ambele, deci nicio nepotrivire la hidratare.
  */
  const [aratam, setAratam] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const nod = gazda.current;
    if (!nod || aratam) return;

    const observator = new IntersectionObserver(
      (intrari) => {
        for (const intrare of intrari) {
          if (!intrare.isIntersecting) continue;
          setAratam(true);
          observator.disconnect();
        }
      },
      /*
        ⚠ `rootMargin`, nu `threshold` ca la `LaIntrareInEcran`. Acolo animația e
        CSS și e deja în pagină; aici e o CERERE DE REȚEA, care trebuie pornită
        mai devreme. Cu un prag, omul ar vedea locul gol câteva sute de
        milisecunde. La 200 px de margine, chunkul sosește înainte să se vadă
        cadranul, iar cronometrul de 100 ms din `useNumberCounter` pornește la
        montare — deci urcarea începe exact când ajunge cu ochii.
      */
      { rootMargin: "200px 0px" },
    );

    observator.observe(nod);
    return () => observator.disconnect();
  }, [aratam]);

  return (
    <div
      ref={gazda}
      className="mx-auto grid w-full max-w-[264px] grid-cols-2 gap-x-4 gap-y-3"
    >
      {SCORURI_PAGESPEED.map((scor, i) => (
        <div key={scor.eticheta} className="flex flex-col items-center">
          <div className={`${MARIME_CADRAN} flex text-ink`}>
            {aratam ? (
              <Gauge
                value={scor.scor}
                size="100%"
                strokeWidth={9}
                gapPercent={4}
                gradient
                tickMarks
                primary={culoareScor(scor.scor)}
                /* Un singur observator pentru toate patru, ca decalajul ăsta să
                   rămână adevărat: dacă fiecare s-ar monta la ora lui, cele
                   patru ar porni deodată. */
                transition={{ delay: i * 120 }}
              />
            ) : (
              LOC_TINUT
            )}
          </div>

          <span className="mt-1.5 text-center text-[11px] leading-[1.25] text-ink-2 sm:text-[11.5px]">
            {scor.eticheta}
          </span>
        </div>
      ))}
    </div>
  );
}
