"use client";

import Image from "next/image";
import { useRef, type RefObject } from "react";
import { inaltimeSigla } from "@/lib/website/comparison";
import { HAIRLINE_ON_WHITE } from "@/lib/website/linii";
import {
  PLATFORME_DREAPTA,
  PLATFORME_STANGA,
  type CercPlatforma,
} from "@/lib/website/migrare";
import { FasciculAnimat } from "./FasciculAnimat";

/**
 * Ilustrația secțiunii „Platforme": șase sigle în cercuri, legate de semnul nostru
 * prin fascicule care curg spre el.
 *
 * Cerută de client (19.08) cu captură: componenta „AnimatedBeam" de la MagicUI,
 * cercuri pe margini, semnul nostru la mijloc. Trei pe fiecare parte, ca acolo.
 *
 * ═══ FASCICULELE CURG SPRE CENTRU, NU DINSPRE EL ═══
 *
 * E singurul lucru din desen care poartă înțeles. Secțiunea spune „mutăm magazinul
 * tău", deci mișcarea merge dinspre platforme spre Edinio. Invers, aceeași
 * ilustrație ar fi spus că noi trimitem ceva în Shopify.
 *
 * De aceea cercurile din DREAPTA primesc `reverse`: fasciculul se aprinde de la
 * cerc spre mijloc, adică de la dreapta la stânga. Fără el, cele două părți ar fi
 * curs în aceeași direcție pe ecran și jumătate din desen ar fi spus pe dos.
 *
 * ⚠ Componentă de client, spre deosebire de celelalte ilustrații ale paginii. Nu e
 * o scăpare: `FasciculAnimat` are nevoie de `ref`-uri către fiecare cerc ca să
 * măsoare unde încep și unde se termină curbele, iar un `ref` nu poate traversa
 * granița server/client. Învelișul subțire folosit la teanc n-ar fi ajutat.
 *
 * ⚠ E ruptă din `SectiuneFascicule` fiindcă acolo mai stă și formularul, care e
 * randat pe SERVER (vezi `FormularMigrare`). Ținute în același fișier, `"use
 * client"` din capul lui ar fi tras și formularul în browser degeaba.
 */
export function IlustratieFascicule() {
  const cutie = useRef<HTMLDivElement>(null);
  const centru = useRef<HTMLDivElement>(null);
  /*
    Câte un `ref` pe cerc, scrise pe rând. Ținute într-un tablou și parcurse cu
    `map` ar fi ieșit mai scurt, dar React nu îngăduie citirea unui `ref` în timpul
    randării — iar șase cercuri nu merită o ocolire ca să pară trei rânduri.
  */
  const stangaSus = useRef<HTMLDivElement>(null);
  const stangaMijloc = useRef<HTMLDivElement>(null);
  const stangaJos = useRef<HTMLDivElement>(null);
  const dreaptaSus = useRef<HTMLDivElement>(null);
  const dreaptaMijloc = useRef<HTMLDivElement>(null);
  const dreaptaJos = useRef<HTMLDivElement>(null);

  return (
    /*
      `relative`, fiindcă fasciculele sunt SVG-uri așezate absolut peste cutie, iar
      pozițiile lor se socotesc față de chenarul ei.

      Înălțimea e fixă și crește o dată, la `sm`: curbele se desenează între
      centrele cercurilor, deci o cutie care își schimbă înălțimea cu conținutul ar
      fi mutat capetele la fiecare recalculare.
    */
    <div
      ref={cutie}
      aria-hidden="true"
      className="relative mx-auto h-[300px] w-full max-w-[560px] sm:h-[360px]"
    >
      {/*
        Spațiul dintre coloane e mai strâns pe telefon, și e o socoteală, nu o
        părere. Cercurile sunt `shrink-0` — nu se îngustează — deci rândul cere
        64 + 78 + 64 plus două spații. Pe un ecran de 320 rămân 232 de pixeli după
        marginile secțiunii și ale casetei: cu 8, rândul iese 222 și intră.
      */}
      <div className="flex h-full items-center justify-between gap-2 sm:gap-4">
        <Coloana
          platforme={PLATFORME_STANGA}
          refs={[stangaSus, stangaMijloc, stangaJos]}
        />

        {/*
          Semnul nostru, mai mare decât celelalte cercuri: e capătul spre care curge
          tot, nu încă o platformă din rând.
        */}
        <Cerc ref={centru} marime="centru">
          {/*
            ⚠ FUNDAL ALB PLIN sub siglă, și nu din întâmplare: harta României din
            pungă e o GAURĂ transparentă, nu cerneală albă — jumătate din fișier e
            transparent. Pe orice tentă sau degrade s-ar vedea fundalul prin ea, iar
            semnul ar înceta să mai fie recognoscibil.

            Și mai mică decât cercul, cu aer în jur: o siglă lipită de margine arată
            tăiată. Aceeași măsură ca la sigla din ilustrațiile de pe „Mentenanță".
          */}
          <Image
            src="/logo.png"
            alt=""
            width={284}
            height={289}
            /* Loader-ul proiectului lasă neatinse imaginile locale; fără asta Next
               se plânge că nu implementează `width`. */
            unoptimized
            className="h-[72%] w-auto"
          />
        </Cerc>

        <Coloana
          platforme={PLATFORME_DREAPTA}
          refs={[dreaptaSus, dreaptaMijloc, dreaptaJos]}
        />
      </div>

      {/*
        Curbele. `curvature` cu semne opuse sus și jos ca arcele să se depărteze de
        mijloc, nu să se suprapună — exact așezarea din captura clientului. Rândul
        din mijloc merge DREPT (zero): e la aceeași înălțime cu semnul nostru, deci
        n-are ce să ocolească.

        Întârzierile nu sunt egale și nici în ordine: șase fascicule pornite la pas
        fix s-ar fi citit ca o roată care se învârte. Așa, se aprind împrăștiat.
      */}
      <FasciculAnimat containerRef={cutie} fromRef={stangaSus} toRef={centru} curvature={75} delay={0} {...CULORI} />
      <FasciculAnimat containerRef={cutie} fromRef={stangaMijloc} toRef={centru} curvature={0} delay={1.1} {...CULORI} />
      <FasciculAnimat containerRef={cutie} fromRef={stangaJos} toRef={centru} curvature={-75} delay={0.5} {...CULORI} />

      <FasciculAnimat containerRef={cutie} fromRef={dreaptaSus} toRef={centru} curvature={75} reverse delay={0.8} {...CULORI} />
      <FasciculAnimat containerRef={cutie} fromRef={dreaptaMijloc} toRef={centru} curvature={0} reverse delay={0.2} {...CULORI} />
      <FasciculAnimat containerRef={cutie} fromRef={dreaptaJos} toRef={centru} curvature={-75} reverse delay={1.4} {...CULORI} />
    </div>
  );
}

/**
 * Diametrul cercului exterior, la mărimea de referință.
 *
 * ⚠ E un număr, nu o clasă, fiindcă din el se socotește cât loc are sigla
 * dinăuntru (vezi `Sigla`) — iar rezultatul iese în procente, deci merge la orice
 * diametru. Cercul desenat chiar poate fi mai mic: mărimile din pagină sunt în
 * `MARIMI`, iar 72 e cea de la `sm` în sus, adică cea față de care s-a făcut
 * proba optică a siglelor.
 */
const AFARA = 72;

/**
 * Culorile fasciculului.
 *
 * ⚠ Verdele de brand, nu portocaliul-mov cu care vine componenta din catalog.
 * Site-ul e verde și neutre; două culori care nu apar nicăieri altundeva ar fi
 * spus „componentă luată de-a gata", ceea ce e chiar impresia de evitat.
 *
 * Curba stinsă de dedesubt e `--color-hairline`, ca toate liniile de un fir de pe
 * site. Scrisă ca valoare fiindcă ajunge într-un atribut SVG, nu într-o clasă —
 * vezi nota din `linii.ts`.
 */
const CULORI = {
  pathColor: HAIRLINE_ON_WHITE,
  pathWidth: 1.5,
  pathOpacity: 1,
  gradientStartColor: "#4fc87a",
  gradientStopColor: "#1AB554",
  duration: 4,
} as const;

/** O coloană de trei cercuri, pe o parte a semnului. */
function Coloana({
  platforme,
  refs,
}: {
  platforme: readonly CercPlatforma[];
  refs: readonly RefObject<HTMLDivElement | null>[];
}) {
  return (
    <div className="flex h-full flex-col justify-between py-1">
      {platforme.map((p, i) => (
        <Cerc key={p.nume} ref={refs[i]} marime="afara">
          <Sigla platforma={p} />
        </Cerc>
      ))}
    </div>
  );
}

/**
 * Cercul alb în care stă o siglă.
 *
 * `placa` aduce albul și umbra — aceeași ridicare ca la orice alt obiect alb de pe
 * site. `z-10`, ca fasciculele desenate peste cutie să treacă pe DEDESUBT: o curbă
 * care intră peste siglă arată a greșeală de straturi.
 *
 * ⚠ DOUĂ MĂRIMI, și a doua e socotită, nu aleasă. Cercurile sunt `shrink-0`, deci
 * rândul cere lățimea lor cap la cap: la mărimea de referință, 72 + 88 + 72 = 232,
 * plus două spații. Pe un ecran de 320 rămân 232 după marginile secțiunii (2×20)
 * și ale casetei (2×24) — adică exact cât cercurile, fără spații. Micșorate cu o
 * nouăme, ies 64 + 78 + 64 = 206, iar cu spații de 8 se ajunge la 222. Intră.
 */
function Cerc({
  ref,
  marime,
  children,
}: {
  ref: RefObject<HTMLDivElement | null>;
  marime: "afara" | "centru";
  children: React.ReactNode;
}) {
  return (
    <div
      ref={ref}
      data-cerc
      className={`placa z-10 flex shrink-0 items-center justify-center rounded-full ${MARIMI[marime]}`}
    >
      {children}
    </div>
  );
}

/**
 * Cele două mărimi de cerc, pe telefon și de la `sm`.
 *
 * ⚠ Clase, nu un `style` cu pixeli, tocmai ca să se poată schimba la `sm`. Prima
 * variantă punea diametrul într-o variabilă CSS pusă inline; arăta drept, dar
 * nimic nu suprascria variabila la lățime mare, deci cercurile rămâneau la
 * mărimea de telefon și pe un ecran de 1920. Se vedea doar dacă le măsurai.
 *
 * ⚠ Mărimile de pe telefon nu sunt alese din ochi: cercurile sunt `shrink-0`, deci
 * rândul cere lățimea lor cap la cap. La mărimea mare, 72 + 88 + 72 = 232, iar pe
 * un ecran de 320 rămân fix 232 după marginile secțiunii (2×20) și ale casetei
 * (2×24) — adică zero loc pentru spațiile dintre ele. Micșorate, 64 + 78 + 64 =
 * 206, plus două spații de 8, fac 222. Intră.
 *
 * Siglele NU se ating de schimbarea asta: sunt măsurate în procente din cerc (vezi
 * `Sigla`), deci se micșorează toate cu același factor.
 */
const MARIMI = {
  afara: "h-16 w-16 sm:h-[72px] sm:w-[72px]",
  centru: "h-[78px] w-[78px] sm:h-[88px] sm:w-[88px]",
} as const;

/**
 * Sigla unei platforme, la aceeași SUPRAFAȚĂ ca celelalte — dar strânsă, dacă nu
 * încape în cerc.
 *
 * ⚠ Nu la aceeași înălțime. Gomag are raportul 3,24 și Shopify 0,88: puse la o
 * înălțime comună, Gomag ar fi ieșit de patru ori mai lat și ar fi dominat desenul
 * fără să însemne nimic. Socoteala și corecțiile optice sunt în `comparison.ts`,
 * unde scrie și cum s-au ales.
 *
 * ═══ SUPRAFAȚA EGALĂ NU AJUNGE ÎNTR-UN CERC ═══
 *
 * În tabelul de comparație siglele stau într-un antet DREPTUNGHIULAR, unde
 * suprafața egală e tot ce trebuie. Aici stau în cerc, iar cercul se îngustează pe
 * măsură ce te depărtezi de mijloc: o siglă lată e tăiată de rotunjire cu mult
 * înainte să atingă diametrul. Măsurat în pagină, cu suprafață egală curată — Wix
 * ieșea 61,7 lat într-un cerc de 64, adică un pixel de aer de fiecare parte, lipit
 * de margine; OpenCart, care e pătrat, avea 16.
 *
 * Deci nu se măsoară lățimea, ci DIAGONALA dreptunghiului siglei: ea e coarda pe
 * care o cere cercul. Cât timp încape în cercul micșorat cu marginea, suprafața
 * egală rămâne neatinsă; când nu, sigla se strânge exact cât trebuie ca să intre.
 * Din cele șase, doar Wix și Gomag se strâng, și puțin.
 *
 * ═══ DE CE PROCENTE, ȘI NU PIXELI ═══
 *
 * Mărimea iese în pixeli din socoteală, dar se scrie ca procent din cerc. Așa,
 * cercul poate fi mai mic pe telefon (vezi `Cerc`) fără să se refacă nimic aici:
 * toate siglele se micșorează cu același factor, deci raportul dintre ele —
 * singurul lucru pe care l-a ales proba optică — rămâne neatins.
 */
const ARIE_IN_CERC = 1200;

/** Cât rămâne liber între siglă și marginea cercului, pe coarda cea mai lungă. */
const MARGINE_IN_CERC = 6;

function Sigla({ platforma }: { platforma: CercPlatforma }) {
  const { logo } = platforma;

  const inalt = inaltimeSigla(logo, ARIE_IN_CERC);
  const lat = inalt * logo.ratio;

  const loc = AFARA - 2 * MARGINE_IN_CERC;
  const diagonala = Math.hypot(lat, inalt);
  const strange = diagonala > loc ? loc / diagonala : 1;

  const procent = (v: number) => `${((v * strange * 100) / AFARA).toFixed(2)}%`;

  return (
    <Image
      src={logo.src}
      /*
        `alt` gol, dinadins: platformele sunt numite în descrierea secțiunii și în
        rândul citit de cititoarele de ecran de deasupra ilustrației. Puse și în
        `alt`, s-ar fi auzit de două ori.
      */
      alt=""
      width={Math.round(lat)}
      height={inalt}
      /* Loader-ul proiectului lasă neatinse imaginile locale. */
      unoptimized
      style={{ width: procent(lat), height: procent(inalt) }}
      className="shrink-0 object-contain"
    />
  );
}
