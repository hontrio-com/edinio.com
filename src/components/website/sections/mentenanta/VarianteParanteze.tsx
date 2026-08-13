"use client";

import { useEffect, useState } from "react";
import { TITLU_MENTENANTA } from "@/lib/website/mentenanta-titlu";

/**
 * ⚠ PIESĂ DE LUCRU, NU DE SITE. SE ȘTERGE ODATĂ CU `/variante-titlu`.
 *
 * Șase feluri de a pune „tehnică" între paranteze, la mărimea adevărată a
 * titlului, ca să se poată alege. Fiecare are numele lui deasupra.
 *
 * Cuvântul e la fel la toate — plin, cu 0 și 1 scoase din el (`.cuvant-binar`).
 * Ce se schimbă e doar ce stă în jurul lui, fiindcă asta s-a cerut.
 */

const VERDE = "var(--color-brand)";
const MONO = "var(--font-mono, ui-monospace, monospace)";

export function VarianteParanteze() {
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-[1100px] px-6 py-16">
        <p className="text-[13px] uppercase tracking-[0.1em] text-ink-3">
          Pagină de lucru — se șterge după alegere
        </p>
        <h2 className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-ink">
          Șase feluri de paranteze
        </h2>
        <p className="mt-2 max-w-[620px] text-[15px] leading-[1.6] text-ink-2">
          Toate sunt la mărimea titlului de pe pagină. Cuvântul e același la
          toate: literă plină, cu 0 și 1 scoase din ea. Spune-mi numărul care îți
          place.
        </p>

        <div className="mt-12 flex flex-col divide-y divide-hairline">
          <Rand numar={1} nume="Mono verde" nota="Paranteze monospațiate, mai subțiri decât cuvântul și mai înalte decât literele. Cea de acum.">
            <MonoVerde />
          </Rand>

          <Rand numar={2} nume="Colțare" nota="Nu paranteze, ci patru colțuri de vizor. Nu seamănă deloc a punctuație — arată a ceva prins în cadru.">
            <Coltare />
          </Rand>

          <Rand numar={3} nume="Binare" nota="Parantezele sunt făcute din același material ca vorba dintre ele: perforate cu 0 și 1.">
            <Binare />
          </Rand>

          <Rand numar={4} nume="Cursor" nota="Paranteze subțiri și un cursor care clipește după cuvânt, ca într-un terminal.">
            <Cursor />
          </Rand>

          <Rand numar={5} nume="Chevroane" nota="Semnele de etichetă din cod, nu paranteze drepte. Se citește ca o bucată de HTML.">
            <Chevroane />
          </Rand>

          <Rand numar={6} nume="Scrise pe rând" nota="Se scriu singure când intri pe pagină: întâi deschiderea, apoi cuvântul, apoi închiderea.">
            <ScrisePeRand />
          </Rand>
        </div>
      </div>
    </div>
  );
}

function Rand({
  numar,
  nume,
  nota,
  children,
}: {
  numar: number;
  nume: string;
  nota: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-10">
      <div className="flex items-baseline gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
          {numar}
        </span>
        <span className="text-[15px] font-semibold text-ink">{nume}</span>
      </div>
      <p className="mt-1.5 ml-9 max-w-[560px] text-[13.5px] leading-[1.55] text-ink-2">{nota}</p>

      {/* Fundalul verde palid al hero-ului, ca să se vadă în condițiile reale. */}
      <div className="mt-6 rounded-2xl bg-[linear-gradient(180deg,#EFFAF3_0%,#FFFFFF_100%)] px-8 py-10">
        <p className="text-center text-[34px] font-bold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[48px] lg:text-[58px]">
          {TITLU_MENTENANTA.inainte}{" "}
          <span className="whitespace-nowrap">{children}</span>
          {TITLU_MENTENANTA.dupa}
        </p>
      </div>
    </div>
  );
}

/** Cuvântul, la fel la toate variantele. */
function Cuvant() {
  return <span className="cuvant-binar">{TITLU_MENTENANTA.cuvant}</span>;
}

/* ─── 1. Mono verde ───────────────────────────────────────────────────────── */

function MonoVerde() {
  const stil = {
    fontFamily: MONO,
    fontWeight: 400,
    color: VERDE,
    fontSize: "0.78em",
    transform: "scaleY(1.42)",
    transformOrigin: "50% 52%",
  } as const;

  return (
    <>
      <span className="inline-block" style={{ ...stil, marginRight: "0.055em" }}>
        [
      </span>
      <Cuvant />
      <span className="inline-block" style={{ ...stil, marginLeft: "0.055em" }}>
        ]
      </span>
    </>
  );
}

/* ─── 2. Colțare ──────────────────────────────────────────────────────────── */

/**
 * Patru colțuri, ca la un vizor. Sunt DESENATE cu margini, nu scrise cu semne:
 * un colț nu există ca literă, deci nu poate fi confundat cu punctuație.
 */
function Coltare() {
  const grosime = "0.055em";
  const brat = "0.2em";
  const inaltime = "0.26em";

  const colt = (sus: boolean, stanga: boolean) =>
    ({
      position: "absolute" as const,
      [sus ? "top" : "bottom"]: "-0.04em",
      [stanga ? "left" : "right"]: "-0.22em",
      width: brat,
      height: inaltime,
      [sus ? "borderTop" : "borderBottom"]: `${grosime} solid ${VERDE}`,
      [stanga ? "borderLeft" : "borderRight"]: `${grosime} solid ${VERDE}`,
    }) as React.CSSProperties;

  return (
    <span className="relative inline-block px-[0.1em]">
      <span aria-hidden style={colt(true, true)} />
      <span aria-hidden style={colt(true, false)} />
      <span aria-hidden style={colt(false, true)} />
      <span aria-hidden style={colt(false, false)} />
      <Cuvant />
    </span>
  );
}

/* ─── 3. Binare ───────────────────────────────────────────────────────────── */

/** Aceleași paranteze, dar făcute din același material ca vorba dintre ele. */
function Binare() {
  const stil = {
    fontFamily: MONO,
    fontWeight: 700,
    fontSize: "0.86em",
    transform: "scaleY(1.3)",
    transformOrigin: "50% 52%",
  } as const;

  return (
    <>
      <span className="cuvant-binar inline-block" style={{ ...stil, marginRight: "0.05em" }}>
        [
      </span>
      <Cuvant />
      <span className="cuvant-binar inline-block" style={{ ...stil, marginLeft: "0.05em" }}>
        ]
      </span>
    </>
  );
}

/* ─── 4. Cursor ───────────────────────────────────────────────────────────── */

function Cursor() {
  const stil = {
    fontFamily: MONO,
    fontWeight: 300,
    color: VERDE,
    fontSize: "0.8em",
    transform: "scaleY(1.35)",
    transformOrigin: "50% 52%",
  } as const;

  return (
    <>
      <span className="inline-block" style={{ ...stil, marginRight: "0.05em" }}>
        [
      </span>
      <Cuvant />
      {/* Cursorul, un bloc care clipește — semnul cel mai cunoscut al unui
          terminal. Clipește rar (1,1s), ca la ei; mai des ar zbârnâi. */}
      <span
        aria-hidden
        className="ml-[0.06em] inline-block align-[-0.02em] motion-reduce:animate-none"
        style={{
          width: "0.42em",
          height: "0.72em",
          backgroundColor: VERDE,
          animation: "clipire-cursor 1.1s steps(1, end) infinite",
        }}
      />
      <span className="inline-block" style={{ ...stil, marginLeft: "0.05em" }}>
        ]
      </span>
    </>
  );
}

/* ─── 5. Chevroane ────────────────────────────────────────────────────────── */

function Chevroane() {
  const stil = {
    fontFamily: MONO,
    fontWeight: 400,
    color: VERDE,
    fontSize: "0.72em",
    transform: "scaleY(1.3)",
    transformOrigin: "50% 52%",
  } as const;

  return (
    <>
      <span className="inline-block" style={{ ...stil, marginRight: "0.06em" }}>
        &lt;
      </span>
      <Cuvant />
      <span className="inline-block" style={{ ...stil, marginLeft: "0.06em" }}>
        /&gt;
      </span>
    </>
  );
}

/* ─── 6. Scrise pe rând ───────────────────────────────────────────────────── */

/**
 * Se scriu singure la intrarea pe pagină: deschiderea, cuvântul, închiderea.
 *
 * ⚠ Cuvântul e ÎN PAGINĂ de la început, doar ascuns cu `opacity`. Scos și pus la
 * loc din JS, ar fi lipsit din ce trimite serverul — adică din titlu, la citit
 * și la indexat.
 */
function ScrisePeRand() {
  /* Pleaca de la 0, adica nescris. ⚠ Nu de la 3 cu o coborare la 0 in efect:
     un `setState` chemat drept in efect e chiar ce opreste regula React
     Compiler din proiect, si pe buna dreptate — ar fi doua randari una peste
     alta la fiecare intrare. */
  const [pas, setPas] = useState(0);

  useEffect(() => {
    const fara =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* Fara miscare: se arata intreg, dar tot printr-un ceas, din acelasi motiv. */
    const ceasuri = fara
      ? [setTimeout(() => setPas(3), 0)]
      : [
          setTimeout(() => setPas(1), 350),
          setTimeout(() => setPas(2), 700),
          setTimeout(() => setPas(3), 1050),
        ];
    return () => ceasuri.forEach(clearTimeout);
  }, []);

  const stil = {
    fontFamily: MONO,
    fontWeight: 400,
    color: VERDE,
    fontSize: "0.78em",
    transform: "scaleY(1.42)",
    transformOrigin: "50% 52%",
    transition: "opacity 160ms ease-out",
  } as const;

  return (
    <>
      <span
        className="inline-block"
        style={{ ...stil, marginRight: "0.055em", opacity: pas >= 1 ? 1 : 0 }}
      >
        [
      </span>
      <span style={{ opacity: pas >= 2 ? 1 : 0, transition: "opacity 160ms ease-out" }}>
        <Cuvant />
      </span>
      <span
        className="inline-block"
        style={{ ...stil, marginLeft: "0.055em", opacity: pas >= 3 ? 1 : 0 }}
      >
        ]
      </span>
    </>
  );
}
