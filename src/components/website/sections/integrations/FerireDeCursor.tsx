"use client";

import { useEffect, useRef } from "react";

/**
 * Câmpul de sigle care se feresc de cursor.
 *
 * Componenta asta e DOAR învelișul: siglele dinăuntru vin gata randate de pe
 * server (`CampSigle`), ca `children`. Aici nu se desenează nimic — se ascultă
 * mouse-ul și se scrie un `transform` pe fiecare casetă.
 *
 * ═══ CE FACE, ÎN CUVINTE ═══
 *
 * Fiecare casetă are un arc. Când cursorul intră în raza ei, ținta arcului se
 * mută în direcția opusă cursorului, cu atât mai departe cu cât e mai aproape;
 * când cursorul pleacă, ținta se întoarce la zero. Arcul e slab amortizat, deci
 * întoarcerea trece puțin de zero și se leagănă înapoi — ăsta e „bounce"-ul.
 *
 * ═══ TREI LUCRURI FĂCUTE ALTFEL DECÂT ÎN EXEMPLU ═══
 *
 * 1. **Un singur ascultător, nu șaisprezece.** Exemplul pune câte un
 *    `mousemove` pe `window` pentru fiecare siglă, iar fiecare cheamă
 *    `getBoundingClientRect()` — adică șaisprezece măsurători de așezare la
 *    fiecare mișcare de mouse, care la 120Hz înseamnă vreo două mii pe secundă,
 *    fiecare oprind browserul ca să recalculeze pagina. Aici e un ascultător
 *    care doar reține unde e cursorul, și o singură măsurătoare pe cadru.
 *
 * 2. **Centrele se măsoară o dată**, nu la fiecare mișcare: nu se schimbă decât
 *    când se schimbă lățimea ferestrei, și atunci le reia `ResizeObserver`.
 *    Se citesc din `offsetLeft`/`offsetTop`, adică din AȘEZARE — nu din
 *    `getBoundingClientRect()`, care ar întoarce poziția din timpul plutirii,
 *    deci alta la fiecare cadru. De aceea casetele sunt centrate din margini
 *    negative în CSS: marginile intră în așezare, `translate` nu.
 *
 * 3. **Arcul e integrat aici**, în cincisprezece rânduri, în loc să vină cu o
 *    bibliotecă de animație. Aceleași numere ca în exemplu (rigiditate 300,
 *    amortizare 20), dar fără nimic adăugat în pachetul trimis către un hero
 *    care e chiar primul lucru desenat pe pagină.
 *
 * ═══ CÂND NU FACE NIMIC ═══
 *
 * Pe telefon și pe tabletă nu se cablează deloc: nu există cursor de ferit, iar
 * un ascultător care nu se declanșează niciodată e tot cod trimis degeaba. La
 * fel când sistemul cere mișcare redusă — atunci stă și plutirea, din CSS.
 */

/** Cât de departe „simte" o casetă cursorul, în px. */
const RAZA = 150;
/** Cât se dă la o parte când cursorul e chiar pe ea, în px. */
const FORTA = 46;
/** Arcul, ca în exemplu: subamortizat, deci se leagănă la întoarcere. */
const RIGIDITATE = 300;
const AMORTIZARE = 20;
/** Sub atâta, casetă oprită: se pune fix pe țintă și nu se mai cere alt cadru. */
const PRAG = 0.04;

export function FerireDeCursor({
  eticheta,
  children,
}: {
  /** Ce aude cine nu vede câmpul. Vezi `etichetaCampului()`. */
  eticheta: string;
  children: React.ReactNode;
}) {
  const camp = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = camp.current;
    if (!el || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const plute = Array.from(el.querySelectorAll<HTMLElement>("[data-pluta]"));
    const n = plute.length;
    if (n === 0) return;

    /* Centrele, în coordonatele câmpului. `el` e `absolute`, deci el e chiar
       `offsetParent`-ul casetelor. */
    const centruX = new Float64Array(n);
    const centruY = new Float64Array(n);
    /* Starea arcurilor: unde sunt și cât de repede se mișcă. */
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const vitezaX = new Float64Array(n);
    const vitezaY = new Float64Array(n);

    const masoara = () => {
      for (let i = 0; i < n; i++) {
        const pluta = plute[i];
        centruX[i] = pluta.offsetLeft + pluta.offsetWidth / 2;
        centruY[i] = pluta.offsetTop + pluta.offsetHeight / 2;
      }
    };
    masoara();

    /* Lățimea ferestrei schimbă și mărimea casetelor, și așezarea lor: la `lg`
       trec pe alt set de poziții. Deci centrele se reiau la fiecare schimbare de
       dimensiune a câmpului, nu doar la rotirea ecranului. */
    const observator = new ResizeObserver(masoara);
    observator.observe(el);

    let cursorX = 0;
    let cursorY = 0;
    let inauntru = false;
    let cadru = 0;
    let ultima = 0;

    const pas = (acum: number) => {
      cadru = 0;
      /*
        Primul cadru n-are cu ce compara; pe urmă pasul se plafonează, ca o filă
        lăsată în fundal să nu se întoarcă cu un salt de câteva secunde.

        ⚠ Și se oprește la ZERO în jos. Un `dt` negativ ar integra arcul înapoi în
        timp, iar arcul e instabil în sensul ăla: crește la fiecare pas în loc să
        se stingă. Măsurat, cu ceasul dat înapoi o jumătate de secundă, caseta a
        sărit la 487px de casa ei. Ceasul de cadre nu merge înapoi de la sine, dar
        un integrator care are nevoie de asta ca să nu explodeze e un integrator
        care așteaptă să fie apelat cum trebuie.
      */
      const dt =
        ultima === 0
          ? 1 / 60
          : Math.min(Math.max((acum - ultima) / 1000, 0), 1 / 30);
      ultima = acum;

      /* SINGURA măsurătoare de așezare din tot ciclul, și e nevoie de ea la
         fiecare cadru: pagina se derulează pe sub cursor chiar dacă mouse-ul stă
         pe loc. */
      let mausX = 0;
      let mausY = 0;
      if (inauntru) {
        const cutie = el.getBoundingClientRect();
        mausX = cursorX - cutie.left;
        mausY = cursorY - cutie.top;
      }

      let inMiscare = false;

      for (let i = 0; i < n; i++) {
        let tintaX = 0;
        let tintaY = 0;

        if (inauntru) {
          const dx = mausX - centruX[i];
          const dy = mausY - centruY[i];
          const distanta = Math.hypot(dx, dy);
          if (distanta < RAZA && distanta > 0.001) {
            const forta = (1 - distanta / RAZA) * FORTA;
            tintaX = (-dx / distanta) * forta;
            tintaY = (-dy / distanta) * forta;
          }
        }

        vitezaX[i] += (-RIGIDITATE * (x[i] - tintaX) - AMORTIZARE * vitezaX[i]) * dt;
        vitezaY[i] += (-RIGIDITATE * (y[i] - tintaY) - AMORTIZARE * vitezaY[i]) * dt;
        x[i] += vitezaX[i] * dt;
        y[i] += vitezaY[i] * dt;

        const oprita =
          Math.abs(x[i] - tintaX) < PRAG &&
          Math.abs(y[i] - tintaY) < PRAG &&
          Math.abs(vitezaX[i]) < PRAG &&
          Math.abs(vitezaY[i]) < PRAG;

        if (oprita) {
          x[i] = tintaX;
          y[i] = tintaY;
          vitezaX[i] = 0;
          vitezaY[i] = 0;
        } else {
          inMiscare = true;
        }

        plute[i].style.transform =
          x[i] === 0 && y[i] === 0
            ? ""
            : `translate3d(${x[i].toFixed(2)}px, ${y[i].toFixed(2)}px, 0)`;
      }

      /* Cât timp cursorul e pe secțiune, ciclul merge (pagina se poate derula).
         După ce pleacă, mai merge doar până se opresc toate arcurile — adică
         exact cât ține legănarea de întoarcere. */
      if (inauntru || inMiscare) cadru = requestAnimationFrame(pas);
      else ultima = 0;
    };

    const porneste = () => {
      if (cadru === 0) {
        ultima = 0;
        cadru = requestAnimationFrame(pas);
      }
    };

    /* Ascultăm pe secțiune, nu pe fereastră: câmpul e `pointer-events-none`, dar
       evenimentele urcă din text și din butoane, deci secțiunea le prinde pe
       toate, și numai pe ale ei. */
    const gazda = el.closest("section") ?? el.parentElement ?? el;

    const laMiscare = (e: PointerEvent) => {
      /* Un ecran tactil trimite și el `pointermove`, la fiecare atingere. Fără
         filtrul ăsta, pe un laptop cu ecran tactil siglele ar fugi de deget. */
      if (e.pointerType !== "mouse") return;
      cursorX = e.clientX;
      cursorY = e.clientY;
      inauntru = true;
      porneste();
    };

    const laPlecare = () => {
      inauntru = false;
      porneste();
    };

    gazda.addEventListener("pointermove", laMiscare, { passive: true });
    gazda.addEventListener("pointerleave", laPlecare, { passive: true });

    return () => {
      gazda.removeEventListener("pointermove", laMiscare);
      gazda.removeEventListener("pointerleave", laPlecare);
      observator.disconnect();
      if (cadru !== 0) cancelAnimationFrame(cadru);
      for (const pluta of plute) pluta.style.transform = "";
    };
  }, []);

  return (
    <div
      ref={camp}
      /*
        `role="img"` cu o singură etichetă, nu șaisprezece imagini cu `alt`:
        altfel un cititor de ecran ar fi enumerat toate mărcile ÎNAINTE de titlul
        paginii. Așa e o singură imagine compusă, cu o descriere care spune ce
        arată. Rolul face descendenții invizibili pentru tehnologiile de asistare,
        deci `alt`-urile dinăuntru nu se mai aud.

        `pointer-events-none`: câmpul acoperă tot hero-ul, inclusiv butoanele.
        Fără asta, casetele ar fi înghițit apăsările pe „Începe gratuit".

        Fără `overflow-hidden` aici: taie chiar secțiunea, care îl are deja pe al
        ei. Pus și pe câmp, ar fi fost a doua tăietură pe exact aceeași muchie.
      */
      role="img"
      aria-label={eticheta}
      className="pointer-events-none absolute inset-0"
    >
      {children}
    </div>
  );
}
