import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ANIMAȚIA SCRISĂ ÎN SMIL TREBUIE SĂ RĂMÂNĂ CEA PE CARE A ÎNLOCUIT-O
  ═══════════════════════════════════════════════════════════════════════════

  `FasciculAnimat` folosea `<motion.linearGradient animate={…}>`, iar asta era
  SINGURUL lucru de pe tot site-ul care trăgea chunkul mare al lui
  `framer-motion`. Măsurat pe build, pe /migrare:

      129.517 octeți bruti / 42.632 gzip / 44.847 brotli

  pentru animarea a două atribute ale unui gradient, în șase instanțe.
  După înlocuirea cu două `<animate>` SMIL: /migrare a scăzut de la 254.024 la
  211.435 octeți gzip de JavaScript, și zero chunkuri cu framer-motion.

  ⚠ CE APĂRĂ PROBA. Nu că animația „arată bine" — asta am verificat-o în Chrome
  151, mutând ceasul SVG de mână și citind `x1.animVal` la șase momente, pe toate
  cele șase instanțe. Proba apără cele patru lucruri care făceau înlocuirea
  ECHIVALENTĂ, și pe care le-ar strica o mână neatentă fără să cadă nimic:

    1. `framer-motion` chiar a plecat de acolo;
    2. curba de accelerare e aceeași — `keySplines` „0.16 1 0.3 1" e chiar
       `ease: [0.16, 1, 0.3, 1]` de dinainte;
    3. durata și întârzierea vin din aceleași două proprietăți, nu din constante
       scrise de mână;
    4. ramura pentru mișcare redusă încă scoate animația, nu doar o ascunde.
*/

const SURSA = readFileSync(
  join(process.cwd(), "src/components/website/sections/migrare/FasciculAnimat.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

/** Sursa fără comentarii — altfel notele care POMENESC framer-motion ar pica proba. */
const cod = SURSA.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("`FasciculAnimat` nu mai importă `framer-motion`", () => {
  assert.doesNotMatch(
    cod,
    /from\s+["']framer-motion["']/,
    "s-a întors `framer-motion` în `FasciculAnimat` — 42.632 octeți gzip pe /migrare, " +
      "pentru animarea a două atribute ale unui gradient",
  );
  assert.doesNotMatch(cod, /<motion\./, "a rămas un element `motion.` în `FasciculAnimat`");
});

test("curba de accelerare e cea din `ease` de dinainte", () => {
  /*
    ⚠ `0.16 1 0.3 1` NU e o alegere nouă. E chiar `ease: [0.16, 1, 0.3, 1]` care
    stătea în `transition`-ul lui `framer-motion`. Un `calcMode` schimbat sau alte
    numere aici ar da altă mișcare — tot fluidă, dar alta.
  */
  assert.match(cod, /calcMode="spline"/, "s-a pierdut `calcMode=\"spline\"` — mișcarea devine liniară");
  assert.match(cod, /keySplines="0\.16 1 0\.3 1"/, "curba nu mai e cea din `ease: [0.16, 1, 0.3, 1]`");
  assert.match(cod, /keyTimes="0;1"/, "s-au pierdut `keyTimes`, fără care `keySplines` nu se aplică");

  const cate = (cod.match(/keySplines="0\.16 1 0\.3 1"/g) ?? []).length;
  assert.equal(cate, 2, `aștept exact două \`<animate>\` (x1 și x2), am găsit ${cate}`);
});

test("durata și întârzierea vin din proprietățile componentei", () => {
  /*
    Erau `duration` și `delay` în `transition`. Dacă cineva le înlocuiește cu
    numere scrise de mână, cele șase instanțe din `IlustratieFascicule` își pierd
    decalajul și toate fasciculele pornesc odată.
  */
  assert.match(cod, /dur=\{`\$\{duration\}s`\}/, "`dur` nu mai vine din proprietatea `duration`");
  assert.match(cod, /begin=\{`\$\{delay\}s`\}/, "`begin` nu mai vine din proprietatea `delay`");
  assert.match(cod, /repeatCount="indefinite"/, "animația nu se mai repetă");
});

test("se animează exact `x1` și `x2`, nu și `y1`/`y2`", () => {
  /*
    ⚠ `y1` și `y2` mergeau de la „0%" la „0%" în AMBELE ramuri (`capeteGradient`).
    Erau o animație care nu mișca nimic. Dacă reapar, nu strică desenul, dar
    înseamnă că cineva a copiat înapoi forma veche fără s-o citească.
  */
  const atribute = [...cod.matchAll(/attributeName="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(atribute, ["x1", "x2"], `se animează ${atribute.join(", ")}`);
});

test("mișcarea redusă scoate animația, nu o ascunde", () => {
  /*
    ⚠ DIFERENȚA CONTEAZĂ. Dacă `<animate>` rămâne randat și doar se ascunde ceva
    cu CSS, motorul SMIL rulează în continuare — adică omul care a cerut mai
    puțină mișcare tot plătește cadrele. Aici ramura întoarce `null`.
  */
  assert.match(
    cod,
    /faraMiscare \? null :/,
    "ramura pentru mișcare redusă nu mai întoarce `null` — verifică dacă animația chiar se oprește",
  );
  assert.match(
    cod,
    /x1="0%"[\s\S]{0,80}x2="0%"/,
    "gradientul nu mai are coordonatele de pornire ca atribute statice. Fără ele, " +
      "căderea blândă dispare: dacă SMIL nu rulează (browser vechi, mișcare redusă), " +
      "fasciculul n-ar mai avea unde să stea.",
  );
});
