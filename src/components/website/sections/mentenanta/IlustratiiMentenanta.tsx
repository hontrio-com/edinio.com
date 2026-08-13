"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { Check } from "lucide-react";
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

/* ═══ LACĂTUL ═══

   Refăcut după o captură trimisă de client (13.08). Apoi cerut „mult mai
   realist", cu raze pe tot panoul și fără pastilele de dedesubt.

   ═══ CE FACE UN DESEN SĂ PARĂ OBIECT, NU FORMĂ ═══

   Prima formă era un dreptunghi rotunjit cu un gradient și un arc gros deasupra.
   Avea culorile potrivite și tot arăta a pictogramă. Ce lipsea nu era culoarea,
   ci LUMINA — și anume patru lucruri, fiecare cu rolul lui:

   1. **TOARTA E UN CILINDRU, nu o linie.** Un metal rotund are pe el o dungă
      albă îngustă (reflexia sursei), o parte luminată și o margine întunecată
      unde se întoarce de la privitor. Gradientul de-a curmezișul ei le pune pe
      toate trei. Cu o culoare plată, toarta arată a sârmă desenată.
   2. **UMBRA DE SUB TOARTĂ, PE CORP.** Toarta stă ÎN FAȚA corpului și îi ia
      lumina: fără pata aia întunecată, cele două par lipite în același plan.
   3. **LUCIUL de sus.** O pată albă care se stinge, pe treimea de sus a corpului:
      așa se poartă o suprafață lucioasă sub o lumină venită de sus-stânga.
   4. **UMBRA DE CONTACT.** O elipsă întunecată chiar sub corp. E lucrul care
      așază obiectul pe ceva; fără ea, lacătul plutește.

   Plus muchia luminată de jos (lumina întoarsă de suprafață) și gaura cheii
   ADÂNCITĂ — întunecată sus, cu o dungă de lumină pe buza de jos.

   ⚠ Culorile de bază rămân cele MĂSURATE cu pipeta din captura clientului:
   #B2E4FF sus pe toartă, #54BAFF aprinsul corpului, #ADC9FB stinsul spre violet,
   #8FD4FC luminile. Ce s-a adăugat sunt tonurile de umbră și de lumină, care în
   captură se pierd în ceață.

   ⚠ Tot ce se poate spune despre „1 la 1": originalul e o imagine matriceală, cu
   margini topite de blur și un tipar de pătrățele în corp. Aici sunt forme și
   gradienți, deci conturul iese curat. Pentru identic pixel cu pixel ar trebui
   fișierul original, nu o captură. */

function Securitate() {
  return (
    <>
      {/*
        ═══ RAZELE ═══

        ⚠ ACOPERĂ TOT PANOUL, nu doar jurul lacătului — cerut de client. Înainte
        erau trei arce scurte de fiecare parte; acum e un evantai care pleacă din
        spatele lacătului și se pierde spre margini.

        `repeating-conic-gradient` desenează razele: o felie colorată, una goală,
        la nesfârșit în jurul unui punct. Punctul e chiar în spatele lacătului
        (50% 46%), deci razele par să iasă din el.

        ⚠ Fără MASCĂ, evantaiul s-ar opri brusc la marginea panoului, cu razele
        tăiate drept — și s-ar vedea că e un tipar, nu o lumină. Masca radială îl
        stinge spre margini.

        ⚠ `absolute inset-0` se agață de PANOU (care e `relative` în
        `SectiuneCeInclude`), nu de piesa asta: de aceea aici nu e niciun
        `relative`, iar razele ajung până la chenar, peste spațierea panoului.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-conic-gradient(from 0deg at 50% 46%, rgba(84,186,255,0.16) 0deg 1.8deg, rgba(84,186,255,0) 1.8deg 9deg)",
          WebkitMaskImage:
            "radial-gradient(115% 92% at 50% 46%, #000 0%, rgba(0,0,0,0.75) 32%, transparent 76%)",
          maskImage:
            "radial-gradient(115% 92% at 50% 46%, #000 0%, rgba(0,0,0,0.75) 32%, transparent 76%)",
        }}
      />

      {/* Pâcla albă din jurul lacătului, peste raze: le stinge în mijloc, ca
          razele să pară că vin DIN SPATELE lui, nu că trec peste el. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(44% 40% at 50% 46%, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.55) 52%, rgba(255,255,255,0) 100%)",
        }}
      />

      <svg
        viewBox="0 0 240 224"
        className="relative w-full max-w-[212px]"
        role="img"
        aria-label="Lacăt închis: magazinul e protejat"
      >
        <defs>
          {/* Toarta, de-a curmezișul: margine întunecată, parte luminată, dunga
              albă a reflexiei, apoi întuneric pe partea care se întoarce. */}
          <linearGradient id="lacat-toarta" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#2E7CC8" />
            <stop offset="0.16" stopColor="#63B8F6" />
            <stop offset="0.32" stopColor="#CFEBFF" />
            <stop offset="0.46" stopColor="#B2E4FF" />
            <stop offset="0.72" stopColor="#4FA0E8" />
            <stop offset="1" stopColor="#2A6FB5" />
          </linearGradient>

          {/* Corpul. Ultimul ton e mai deschis decât cel de deasupra lui: e
              lumina întoarsă de suprafața pe care stă. */}
          <linearGradient id="lacat-corp" x1="0.2" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor="#9EDDFF" />
            <stop offset="0.26" stopColor="#54BAFF" />
            <stop offset="0.62" stopColor="#5AA8F6" />
            <stop offset="0.88" stopColor="#ADC9FB" />
            <stop offset="1" stopColor="#8FD4FC" />
          </linearGradient>

          <linearGradient id="lacat-luciu" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.62" />
            <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.14" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="gaura-cheii" x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0" stopColor="#1C5C9C" />
            <stop offset="1" stopColor="#3C8FD4" />
          </linearGradient>

          <radialGradient id="umbra-contact" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#2A6FB5" stopOpacity="0.34" />
            <stop offset="1" stopColor="#2A6FB5" stopOpacity="0" />
          </radialGradient>

          <filter id="ceata-larga" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id="ceata-stransa" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="umbra-sub-toarta" x="-30%" y="-60%" width="160%" height="260%">
            <feGaussianBlur stdDeviation="7" />
          </filter>

          {/* Umbra de sub toartă se taie pe forma corpului: altfel s-ar vedea
              revărsată în afara lui, ca o pată. */}
          <clipPath id="doar-corpul">
            <rect x="60" y="94" width="120" height="104" rx="29" />
          </clipPath>
        </defs>

        {/* ── Umbra de contact, sub tot ── */}
        <ellipse cx="120" cy="205" rx="66" ry="12" fill="url(#umbra-contact)" />

        {/* ── Ceața ── */}
        <g filter="url(#ceata-larga)" opacity="0.5">
          <FormaLacat corp="#5FBEFF" toarta="#5FBEFF" />
        </g>
        <g filter="url(#ceata-stransa)" opacity="0.42">
          <FormaLacat corp="#7ACCFF" toarta="#7ACCFF" />
        </g>

        {/* ── Toarta, în spatele corpului ── */}
        <path
          d="M88 106 V80 a32 32 0 0 1 64 0 V106"
          fill="none"
          stroke="url(#lacat-toarta)"
          strokeWidth="20"
          strokeLinecap="round"
        />
        {/* Dunga de lumină, subțire și puțin la stânga de mijloc. */}
        <path
          d="M94.5 104 V80 a25.5 25.5 0 0 1 51 0 V104"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.42"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* ── Corpul ── */}
        <rect x="60" y="94" width="120" height="104" rx="29" fill="url(#lacat-corp)" />

        {/* Umbra pe care o aruncă toarta pe corp. */}
        <g clipPath="url(#doar-corpul)">
          <path
            d="M78 84 h84 v26 h-84 z"
            fill="#1F63A8"
            opacity="0.34"
            filter="url(#umbra-sub-toarta)"
          />
        </g>

        {/* Luciul de sus și muchia luminată de jos. */}
        <path
          d="M60 123 a29 29 0 0 1 29 -29 h62 a29 29 0 0 1 29 29 c-30 16 -90 16 -120 0 z"
          fill="url(#lacat-luciu)"
        />
        <path
          d="M69 186 a29 29 0 0 0 20 12 h62 a29 29 0 0 0 20 -12"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.3"
          strokeWidth="2.5"
        />

        {/* ── Gaura cheii, adâncită ── */}
        <g>
          <circle cx="120" cy="136" r="13" fill="url(#gaura-cheii)" />
          <path d="M115 146 h10 l3.5 23 h-17 z" fill="url(#gaura-cheii)" />
          {/* Buza de jos, luminată: fără ea, gaura arată lipită, nu scobită. */}
          <path
            d="M111.5 169 h17"
            stroke="#FFFFFF"
            strokeOpacity="0.5"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="120" cy="131" r="13" fill="#0F4B86" opacity="0.22" />
        </g>
      </svg>
    </>
  );
}

/**
 * Forma lacătului, pentru cele două straturi de ceață.
 *
 * ⚠ De aceea culorile vin din afară. Cu două copii ale căilor, o îndreptare la
 * rotunjirea corpului s-ar fi făcut într-una singură, iar ceața ar fi rămas în
 * urmă cu altă formă — și tocmai ceața e cea care nu se vede că e greșită.
 */
function FormaLacat({ corp, toarta }: { corp: string; toarta: string }) {
  return (
    <>
      <path
        d="M88 106 V80 a32 32 0 0 1 64 0 V106"
        fill="none"
        stroke={toarta}
        strokeWidth="20"
        strokeLinecap="round"
      />
      <rect x="60" y="94" width="120" height="104" rx="29" fill={corp} />
    </>
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
