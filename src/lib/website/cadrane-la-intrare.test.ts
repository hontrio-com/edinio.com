import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CADRANELE DE PE /optimizare SE ADUC LA CERERE, ȘI ASTA E UȘOR DE STRICAT TĂCUT
  ═══════════════════════════════════════════════════════════════════════════

  Măsurat pe biți, 01.09.2026:

      acum   610.172 bruți / 189.248 gzip / 164.327 brotli
      după   575.569        / 176.033      / 152.324
      delta   34.603        /  13.215      /  12.003   = 7,30% din rută

  Pleacă felia de arcuri a lui `framer-motion` (26.960 bruți) plus modulul
  `Gauge`. Verificat pe build după schimbare: /optimizare a trecut de la 15 la 14
  chunkuri, 225.617 → 214.379 gzip, și ZERO chunkuri cu framer în încărcarea
  inițială.

  ⚠ TREI FELURI DE A ANULA TOT CÂȘTIGUL FĂRĂ CA NIMIC SĂ CADĂ:

  1. Mutarea lui `dynamic()` în `PanouPageSpeed.tsx`, „ca să fie mai simplu".
     Acela e componentă de SERVER, iar documentația lui Next spune că un import
     dinamic dintr-o componentă de server NU se despică automat. Build verde,
     măsurătoare neschimbată, zero octeți economisiți.

  2. Un `import { Gauge } from "@/components/ui/gauge-1"` STATIC lăsat lângă
     `dynamic()`. Importul static câștigă, cei 26.960 se întorc, iar o probă care
     verifică doar că `dynamic()` există rămâne verde. Prima formă a probei ăsteia
     avea exact gaura asta — a găsit-o un sceptic, nu eu.

  3. Scoaterea locului ținut din `loading`. Grila cade de la 224,75 la 52,75 px
     și cele patru etichete sar. Măsurat în browser, în toate trei variantele.

  ⚠ CE NU APĂRĂ PROBA: că animația arată bine. Aia s-a verificat în Chrome —
  cele patru cadrane se montează la intrarea în ecran, ies 86×86 px fiecare,
  grila rămâne 224,75 și pagina 5764, iar cifrele urcă. (Într-o filă de fundal
  rămân la 0: `requestAnimationFrame` e strangulat acolo, la fel ca ceasul SMIL
  de pe /migrare. Artefact de măsurare, nu defect.)
*/

const RAD = process.cwd();

/** ⚠ CRLF normalizat: fișierele proiectului sunt scrise cu CRLF, iar o potrivire
    ancorată pe `\n` ar cădea fals. `PanouPageSpeed.tsx` are 112 terminații CRLF. */
const citeste = (cale: string) => readFileSync(join(RAD, cale), "utf8").replace(/\r\n/g, "\n");

const CADRANE = "src/components/website/sections/optimizare/CadraneLaIntrare.tsx";
const PANOU = "src/components/website/sections/optimizare/PanouPageSpeed.tsx";

const sursaCadrane = citeste(CADRANE);
const codCadrane = sursaCadrane.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const codPanou = citeste(PANOU).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("învelișul e componentă de client", () => {
  /*
    ⚠ ASTA E PAZA CEA MAI IMPORTANTĂ. Fără „use client", `dynamic()` de dedesubt
    nu despică nimic, iar `ssr: false` e chiar eroare de build în componentă de
    server. Scoaterea directivei ar face schimbarea inutilă, nu stricată — și
    exact de aia nu s-ar vedea.
  */
  assert.match(
    sursaCadrane,
    /^"use client";/,
    `${CADRANE} nu mai începe cu "use client". Fără ea, importul dinamic nu ` +
      "despică nimic: build verde, aceiași octeți.",
  );
});

test("cadranul se aduce prin import dinamic, fără randare pe server", () => {
  assert.match(codCadrane, /dynamic\(/, "nu se mai folosește `next/dynamic`");
  assert.match(codCadrane, /ssr:\s*false/, "`ssr: false` a dispărut — cadranul se întoarce în HTML");
  assert.match(
    codCadrane,
    /import\(["']@\/components\/ui\/gauge-1["']\)/,
    "importul dinamic nu mai arată spre `gauge-1`",
  );
});

test("nu există niciun import STATIC al cadranului", () => {
  /*
    ⚠ GAURA GĂSITĂ DE SCEPTIC. Toate celelalte afirmații trec și dacă cineva pune,
    lângă `dynamic()`, un `import { Gauge } from "@/components/ui/gauge-1"`.
    Importul static câștigă, chunkul se întoarce în încărcarea inițială, și proba
    rămâne verde. Deci: `gauge-1` are voie să apară AICI doar înăuntrul unui
    `import(...)`.
  */
  const mentiuni = [...codCadrane.matchAll(/gauge-1/g)].length;
  const inImportDinamic = [...codCadrane.matchAll(/import\([^)]*gauge-1[^)]*\)/g)].length;
  assert.equal(
    mentiuni,
    inImportDinamic,
    `\`gauge-1\` apare de ${mentiuni} ori în ${CADRANE}, dar doar ${inImportDinamic} ` +
      "înăuntrul unui `import(...)`. Un import static ar aduce chunkul înapoi în " +
      "încărcarea inițială, fără ca nimic altceva să se plângă.",
  );

  assert.doesNotMatch(
    codPanou,
    /from\s+["']@\/components\/ui\/gauge-1["']/,
    `${PANOU} importă din nou \`gauge-1\` direct. E componentă de SERVER: de acolo ` +
      "importul nu se despică, iar cadranul se întoarce în pachetul inițial.",
  );
});

test("locul cadranului rămâne ținut cât se aduce", () => {
  /*
    Fără el, grila panoului cade de la 224,75 la 52,75 px — măsurat — și cele
    patru etichete sar pe verticală. Nu e CLS de pagină (ilustrația e
    `aspect-[4/3]`, panoul `absolute inset-0`), dar se vede.
  */
  assert.match(codCadrane, /loading:\s*\(\)\s*=>/, "`dynamic()` n-are `loading` — locul nu se mai ține");
  assert.match(
    codCadrane,
    /aspect-square/,
    "locul ținut nu mai e pătrat. SVG-ul are `viewBox=\"0 0 100 100\"` și iese " +
      "86×86 px — orice altă formă schimbă înălțimea grilei.",
  );
});

test("se aduce înainte să se vadă, nu când se vede", () => {
  /*
    ⚠ `rootMargin`, nu `threshold`. Cadranul nu mai e în HTML: apariția lui costă
    o cerere de rețea. Cu un prag, omul ar vedea locul gol câteva sute de
    milisecunde. Cu 200 px de margine, chunkul sosește înainte.
  */
  assert.match(codCadrane, /new IntersectionObserver\(/, "nu mai există observator — cadranul se aduce oricând");
  assert.match(
    codCadrane,
    /rootMargin:\s*["']200px 0px["']/,
    "marginea de 200px a dispărut. Cu prag în loc de margine, se vede locul gol.",
  );
});

test("panoul păstrează cifrele adevărate pentru cine ascultă pagina", () => {
  /*
    ⚠ ASTA FACE `ssr: false` NEVINOVAT. La randarea de pe server, cadranele
    trimiteau patru ZEROURI (`stroke-dasharray: 0, …`) — text adevărat în arborele
    de accesibilitate, pe un `<svg>` fără `role` și fără `aria-hidden`. Cifrele
    adevărate stăteau, și stau, în rândul de mai jos, scris de server.

    Dacă rândul ăsta dispare, `ssr: false` chiar devine o pierdere.
  */
  assert.match(codPanou, /className="sr-only"/, `${PANOU} a pierdut rândul cu cifrele pentru cititoarele de ecran`);
  assert.match(codPanou, /SCORURI_PAGESPEED/, `${PANOU} nu mai citește scorurile`);
});
