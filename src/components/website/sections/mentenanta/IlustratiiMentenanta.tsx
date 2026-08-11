"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import type { CardMentenanta } from "@/lib/website/mentenanta";

/**
 * Ilustrațiile celor patru carduri de pe „Mentenanță gratuită".
 *
 * ═══ ARTEFACTE, NU ORNAMENTE ═══
 *
 * „Actualizări", „securitate", „optimizări" sunt cuvinte abstracte, iar
 * ilustrația lor obișnuită e o iconiță într-un pătrat colorat — exact tiparul
 * pe care clientul l-a tăiat de fiecare dată. Aici fiecare card arată un
 * ARTEFACT: lista de versiuni instalate, drumul unei sesizări, panoul de stare
 * al infrastructurii, măsurătoarea de viteză. Aceeași alegere ca la
 * `TrustedProduct` de pe pagina de start, unde încrederea a fost desenată ca o
 * pagină de produs adevărată, nu ca un simbol.
 *
 * ═══ TOATE PATRU ÎN ACELAȘI CADRU ═══
 *
 * `Panou` e obligatoriu pentru toate: același chenar, aceeași densitate, un cap
 * și trei rânduri. Uniformitatea e jumătate din motivul pentru care o serie
 * arată a serie — patru desene cu forme diferite se citesc ca patru lucruri
 * adunate. Structural, nu ținut minte: dacă cineva desenează al cincilea, e
 * obligat să treacă tot prin `Panou`.
 *
 * ⚠ Tot ce e aici e `aria-hidden` la nivelul învelișului din `SectiuneCeInclude`:
 * fiecare ilustrație repetă exact ce scrie în descrierea de alături, iar citită
 * a doua oară ar fi doar zgomot pentru cine folosește un cititor de ecran.
 */

/* Verdele pentru TEXT: #1AB554 are pe alb 2,6:1, sub prag. Aceeași constantă și
   același motiv ca în `IntegrationsBenzi`, `Comparison` și `PricingSection`. */
const VERDE = "#12874A";

/** Cadrul comun. Vezi nota de mai sus — nu se ocolește. */
function Panou({ cap, children }: { cap: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-[14px] border border-hairline bg-white">
      <div className="border-b border-hairline bg-tint px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          {cap}
        </span>
      </div>
      <div className="divide-y divide-hairline">{children}</div>
    </div>
  );
}

/** Un rând de panou: ce e în stânga, ce e în dreapta. */
function Rand({ stanga, dreapta }: { stanga: React.ReactNode; dreapta: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0 truncate text-[13px] text-ink">{stanga}</span>
      <span className="shrink-0 text-[12px] font-medium text-ink-3">{dreapta}</span>
    </div>
  );
}

function Actualizari() {
  return (
    <Panou cap="Versiuni instalate">
      <Rand
        stanga={<><span className="font-semibold">v3.12.0</span> — plăți și facturare</>}
        dreapta={
          <span className="inline-flex items-center gap-1" style={{ color: VERDE }}>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            azi
          </span>
        }
      />
      <Rand stanga={<><span className="font-semibold">v3.11.4</span> — curieri</>} dreapta="acum 6 zile" />
      <Rand stanga={<><span className="font-semibold">v3.11.0</span> — pagina de magazin</>} dreapta="acum 2 săpt." />
    </Panou>
  );
}

function Remediere() {
  /* Drumul unei sesizări, cu punctele legate printr-o linie: pasul făcut e
     plin, cel în lucru e inelat, cel care urmează e gol. Trei stări, un singur
     desen — o iconiță diferită la fiecare pas ar fi rupt ritmul. */
  const pasi = [
    { text: "Sesizare primită", stare: "gata" as const, cand: "10:14" },
    { text: "În lucru", stare: "acum" as const, cand: "10:21" },
    { text: "Rezolvat", stare: "urmeaza" as const, cand: "" },
  ];
  return (
    <Panou cap="Drumul unei sesizări">
      {pasi.map((p) => (
        <div key={p.text} className="flex items-center gap-3 px-4 py-3">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={
              p.stare === "gata"
                ? { backgroundColor: VERDE }
                : p.stare === "acum"
                  ? { backgroundColor: "#fff", boxShadow: `inset 0 0 0 2px ${VERDE}` }
                  : { backgroundColor: "var(--color-hairline)" }
            }
          />
          <span
            className="min-w-0 flex-1 truncate text-[13px]"
            style={{ color: p.stare === "urmeaza" ? "var(--color-ink-3)" : "var(--color-ink)" }}
          >
            {p.text}
          </span>
          <span className="shrink-0 text-[12px] font-medium text-ink-3">{p.cand}</span>
        </div>
      ))}
    </Panou>
  );
}

function Securitate() {
  const randuri = [
    { ce: "Certificat SSL", stare: "activ" },
    { ce: "Copii de siguranță", stare: "zilnic" },
    { ce: "Disponibilitate", stare: "99,9%" },
  ];
  return (
    <Panou cap="Starea infrastructurii">
      {randuri.map((r) => (
        <Rand
          key={r.ce}
          stanga={
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
              {r.ce}
            </span>
          }
          dreapta={<span style={{ color: VERDE }}>{r.stare}</span>}
        />
      ))}
    </Panou>
  );
}

/*
  ═══ INDICATOARELE LIGHTHOUSE ═══

  Cerute de client, „identic, cu tot cu animațiile lor". Sunt reproduse din
  raportul Google Lighthouse: disc palid în culoarea scorului, arc care se
  desenează peste el, numărul la mijloc, eticheta dedesubt.

  ⚠ NUMERELE SUNT ILUSTRATIVE, nu o măsurătoare. Clientul a cerut „toate peste
  93". Dacă vreodată se rulează Lighthouse pe un magazin real, valorile de aici
  se înlocuiesc cu cele măsurate — o pagină comercială care arată un scor arată
  o afirmație, iar afirmațiile trebuie să poată fi susținute.
*/

/** Verdele Lighthouse pentru „trecut" (scor ≥ 90). E al lor, nu al nostru. */
const VERDE_LIGHTHOUSE = "#0CCE6B";

const SCORURI = [
  { eticheta: "Performanță", valoare: 96 },
  { eticheta: "Accesibilitate", valoare: 98 },
  { eticheta: "Bune practici", valoare: 95 },
  { eticheta: "SEO", valoare: 100 },
];

/* Geometria cercului. `viewBox` de 120 ca în markup-ul lor, ca proporțiile
   dintre grosimea inelului și rază să iasă aceleași. */
const RAZA = 52;
const CIRCUMFERINTA = 2 * Math.PI * RAZA;
const DURATA_UMPLERE_MS = 1000;

function Indicator({ eticheta, valoare }: { eticheta: string; valoare: number }) {
  /*
   * Numărul pornește de la valoarea FINALĂ, nu de la zero.
   *
   * Așa, ce trimite serverul e chiar ce trebuie să vadă omul: fără JavaScript
   * rămâne scorul, nu un „0". Urcarea se pornește la montare, din
   * `useLayoutEffect` — pus în `useEffect`, browserul ar fi apucat să vopsească
   * o dată valoarea finală și s-ar fi văzut o clipire înainte de animație.
   * Același tipar ca prețul care urcă din `PricingSection`.
   */
  const [afisat, setAfisat] = useState(valoare);
  const [pornit, setPornit] = useState(false);

  const useIzomorf = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIzomorf(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setPornit(true);
      return;
    }
    setAfisat(0);
    setPornit(true);
    let raf = 0;
    const start = performance.now();
    const pas = (acum: number) => {
      const t = Math.min(1, (acum - start) / DURATA_UMPLERE_MS);
      /* Aceeași curbă ca arcul, altfel numărul și inelul ajung în momente
         diferite și se vede că sunt două animații, nu una. */
      const eased = 1 - Math.pow(1 - t, 3);
      setAfisat(Math.round(valoare * eased));
      if (t < 1) raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);

    /*
     * ⚠ PLASĂ DE SIGURANȚĂ: dacă `requestAnimationFrame` nu rulează, numărul
     * rămâne pe 0.
     *
     * Nu e o presupunere. Măsurat: într-o filă de fundal, Chrome nu livrează
     * NICIUN cadru — zero în 900 ms. Deci cine deschide pagina cu clic pe rotiță
     * și se uită la ea mai târziu ar fi găsit patru zerouri, adică exact
     * contrariul a ce spune ilustrația. La fel orice randare fără cadre (o
     * captură automată, un generator de imagine socială).
     *
     * `setTimeout` rulează și în filă ascunsă (încetinit, dar rulează), deci
     * după ce animația ar fi trebuit să se termine, valoarea se pune pur și
     * simplu la loc. Când fila e vizibilă, animația a ajuns deja acolo și linia
     * asta nu schimbă nimic.
     */
    const plasa = window.setTimeout(() => setAfisat(valoare), DURATA_UMPLERE_MS + 250);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(plasa);
    };
  }, [valoare]);

  const tinta = CIRCUMFERINTA * (1 - valoare / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[64px] w-[64px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          {/* Discul palid din spate: culoarea scorului la 10%, ca la ei. */}
          <circle cx="60" cy="60" r="56" fill={VERDE_LIGHTHOUSE} fillOpacity="0.1" />
          <circle
            cx="60" cy="60" r={RAZA}
            fill="none"
            stroke={VERDE_LIGHTHOUSE}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERINTA}
            /*
              Inelul se desenează din `stroke-dashoffset`: plin la început
              (nimic vizibil), până la țintă. Pornit doar după montare, ca
              tranziția să aibă de unde pleca — pusă din prima randare, valoarea
              ar fi fost deja cea finală și n-ar fi avut ce anima.
            */
            strokeDashoffset={pornit ? tinta : CIRCUMFERINTA}
            style={{
              transition: `stroke-dashoffset ${DURATA_UMPLERE_MS}ms cubic-bezier(0.33,1,0.68,1)`,
            }}
            className="motion-reduce:transition-none"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-[20px] font-medium tabular-nums"
          style={{ color: VERDE_LIGHTHOUSE }}
        >
          {afisat}
        </span>
      </div>
      <span className="text-center text-[11px] leading-[1.3] text-ink-2">{eticheta}</span>
    </div>
  );
}

function Optimizari() {
  return (
    <Panou cap="Raport de performanță">
      <div className="flex items-start justify-center gap-3 px-3 py-6 sm:gap-5 sm:px-4">
        {SCORURI.map((s) => (
          <Indicator key={s.eticheta} eticheta={s.eticheta} valoare={s.valoare} />
        ))}
      </div>
    </Panou>
  );
}

const DESENE: Record<CardMentenanta["id"], () => React.JSX.Element> = {
  actualizari: Actualizari,
  remediere: Remediere,
  securitate: Securitate,
  optimizari: Optimizari,
};

export function IlustratieMentenanta({ id }: { id: CardMentenanta["id"] }) {
  const Desen = DESENE[id];
  return <Desen />;
}
