"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ImageIcon } from "lucide-react";
import { IMAGINE_OPTIMIZATA, greutate } from "@/lib/website/optimizare";

/**
 * Ilustrația cardului „Imagini optimizate": aceeași poză de două ori, cu o
 * săgeată între ele și greutatea sub fiecare.
 *
 * ⚠ ACEEAȘI POZĂ ÎN AMÂNDOUĂ CASETELE, dinadins. Ideea cardului e că imaginea
 * ARATĂ LA FEL după optimizare și doar cântărește altceva. Cu două fișiere
 * diferite, desenul ar fi spus exact pe dos: că a doua e mai mică pentru că e mai
 * proastă.
 *
 * ═══ ANIMAȚIA: GREUTATEA COBOARĂ, NU SE SCHIMBĂ DINTR-O DATĂ ═══
 *
 * Cerută de client. Când panoul intră în ecran, numărul din dreapta pleacă de la
 * 5 MB și coboară până la greutatea optimizată, iar peste poză trece o dungă de
 * lumină, o singură dată — ca și cum tocmai a fost prelucrată.
 *
 * ⚠ COBORÂREA E LOGARITMICĂ, nu liniară, și asta e tot ce face cifra să se
 * citească. Între 5 MB și 124 KB sunt patruzeci de ori; liniar, numărul ar fi
 * stat aproape tot timpul în megaocteți și ar fi sărit în kiloocteți în ultima
 * zecime de secundă. În logaritm trece la fel de mult timp prin fiecare ordin de
 * mărime: 5 MB → 1,8 MB → 640 KB → 220 KB → 124 KB.
 *
 * O SINGURĂ dată, la intrarea în ecran: o cifră care o ia de la capăt de fiecare
 * dată când derulezi înapoi e decor, nu informație.
 *
 * Cu `prefers-reduced-motion` nu se mișcă nimic — se vede direct greutatea finală.
 */

/** Cât ține coborârea. */
const DURATA = 1300;

export function PanouImagini() {
  const gazda = useRef<HTMLDivElement>(null);
  /*
    Pornește de la valoarea FINALĂ, nu de la 5 MB: asta e ce trimite serverul în
    HTML, deci ce citește un motor de căutare și ce vede cineva cu JavaScript
    oprit. Adevărul, nu punctul de pornire al unei animații.
  */
  const [octeti, setOcteti] = useState(IMAGINE_OPTIMIZATA.dupa);
  const [progres, setProgres] = useState(1);

  useEffect(() => {
    const el = gazda.current;
    if (!el) return;
    if (typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver !== "function") return;

    const { inainte, dupa } = IMAGINE_OPTIMIZATA;
    const logDe_la = Math.log(inainte);
    const logPanaLa = Math.log(dupa);

    let cadru = 0;
    let inceput = 0;

    const pas = (acum: number) => {
      if (inceput === 0) inceput = acum;
      const t = Math.min((acum - inceput) / DURATA, 1);
      /* Ease-out cubic: pornește repede și se așază lin. Cu o curbă simetrică,
         cifra ar fi părut că se târăște la început și se repede la sfârșit. */
      const e = 1 - Math.pow(1 - t, 3);

      setOcteti(Math.exp(logDe_la + (logPanaLa - logDe_la) * e));
      setProgres(e);

      cadru = t < 1 ? requestAnimationFrame(pas) : 0;
    };

    const observator = new IntersectionObserver(
      (intrari) => {
        if (!intrari.some((i) => i.isIntersecting)) return;
        observator.disconnect();
        if (cadru === 0) cadru = requestAnimationFrame(pas);
      },
      { threshold: 0.3 },
    );
    observator.observe(el);

    return () => {
      observator.disconnect();
      if (cadru !== 0) cancelAnimationFrame(cadru);
    };
  }, []);

  return (
    /*
      Umple ilustrația cardului. `@container`: casetele se măsoară în procente din
      lățimea panoului — vezi nota de la lățimea lor.
    */
    <div
      ref={gazda}
      className="@container absolute inset-0 flex items-center justify-center px-4 py-4 sm:px-5"
    >
      {/*
        Cele două greutăți ca text stabil, pentru cine ascultă pagina: cifra din
        dreapta se schimbă de zeci de ori în timpul coborârii, iar un cititor de
        ecran le-ar fi anunțat pe toate.
      */}
      <p className="sr-only">
        Aceeași fotografie de produs, înainte și după optimizare:{" "}
        {greutate(IMAGINE_OPTIMIZATA.inainte)} față de{" "}
        {greutate(IMAGINE_OPTIMIZATA.dupa)}.
      </p>

      {/*
        GRILĂ de două rânduri, nu un rând cu margini: casetele sus, greutățile
        dedesubt, iar săgeata într-o celulă a rândului de sus.

        Așa se centrează singură pe casete. Înainte stătea pe același rând cu
        totul și avea nevoie de o margine scrisă de mână, „jumătate din înălțimea
        casetei" — un număr magic care trebuia recalculat la fiecare schimbare de
        mărime, și care a și fost greșit o dată.
      */}
      <div
        className="grid grid-cols-[auto_auto_auto] items-center justify-center gap-x-3"
        aria-hidden="true"
      >
        <Caseta />
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={2} />
        <Caseta progres={progres} />

        <Greutate text={greutate(IMAGINE_OPTIMIZATA.inainte)} />
        <span />
        <Greutate text={greutate(octeti)} />
      </div>
    </div>
  );
}

/**
 * O casetă: rama albă, cu poza mică înăuntru.
 *
 * ⚠ RAMA ȘI POZA SUNT DOUĂ MĂRIMI DIFERITE, și asta a fost o corectură: prima
 * oară, la „fă poza mai mică", am micșorat toată caseta. Clientul a lămurit —
 * caseta era bună, doar poza dinăuntru era prea mare. Deci rama rămâne cât era,
 * iar fotografia stă la 58% din înălțimea ei, cu aer de jur împrejur, ca o
 * miniatură pe o coală.
 *
 * ⚠ LĂȚIMEA RAMEI E LEGATĂ DE LĂȚIMEA PANOULUI, nu de treptele de ecran —
 * aceeași lecție ca la cadranele de scoruri, unde numere fixe pe trepte ieșeau
 * din card la trei lățimi din nouăsprezece. Aici locul e strâns de ALĂTURI: două
 * casete plus săgeata plus spațiile trebuie să încapă în lățimea panoului, deci
 * `(panou − 48) / 2`, adică `50cqw − 24px`.
 *
 * Raportul e 4:5, nu pătrat, fiindcă fotografia trimisă are 806x1000 — adică
 * 0,806, la un fir de 4:5. Așa rama și poza au aceeași formă, iar `object-contain`
 * n-are ce lăsa gol pe laturi.
 */
function Caseta({ progres }: { progres?: number }) {
  const areImagine = IMAGINE_OPTIMIZATA.src.length > 0;

  return (
    <div className="relative flex aspect-[4/5] w-[calc(50cqw-24px)] max-w-[118px] min-w-[64px] items-center justify-center overflow-hidden rounded-[10px] border border-hairline bg-white">
      {areImagine ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={IMAGINE_OPTIMIZATA.src}
          alt={IMAGINE_OPTIMIZATA.alt}
          loading="lazy"
          decoding="async"
          /* `h-[58%]` și lățime liberă: poza are chiar raportul ramei, deci nu
             rămâne gol pe laturi, și se micșorează odată cu ea la orice ecran. */
          className="h-[58%] w-auto object-contain"
        />
      ) : (
        /* Același substituent ca la „Problema", ca cele două secțiuni să nu arate
           ca două site-uri cât timp așteptăm fișierul. */
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center">
          <ImageIcon className="h-5 w-5 text-ink-3" strokeWidth={1.5} />
          <span className="text-[10px] leading-[1.25] text-ink-3">
            {IMAGINE_OPTIMIZATA.hint}
          </span>
        </div>
      )}

      {/*
        Dunga de lumină care trece o dată peste casetă, cât coboară cifra.

        Nu e o bară de progres și nu acoperă imaginea: e o dungă albă foarte
        slabă, stinsă la capete, care traversează de sus în jos. La sfârșit dispare
        de tot — dacă ar rămâne, ar arăta ca o pată pe fotografie.

        Poziția vine din chiar progresul coborârii, nu dintr-o animație CSS
        paralelă: două cronologii separate s-ar fi desincronizat la primul cadru
        pierdut, iar dunga ar fi ieșit din poză înainte să se așeze cifra.
      */}
      {progres !== undefined && progres < 1 ? (
        <span
          className="pointer-events-none absolute inset-x-0 h-1/3"
          style={{
            top: `${-33 + progres * 133}%`,
            opacity: 1 - progres,
            background:
              "linear-gradient(to bottom, transparent, rgba(255,255,255,0.85), transparent)",
          }}
        />
      ) : null}
    </div>
  );
}

/** Greutatea, sub casetă. Celulă proprie în grilă, ca să stea centrată pe ea. */
function Greutate({ text }: { text: string }) {
  return (
    <p className="mt-2 text-center text-[12px] font-medium tabular-nums text-ink-2">
      {text}
    </p>
  );
}
