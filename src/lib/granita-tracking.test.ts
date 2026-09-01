import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  GRANITA DINTRE CELE DOUA SISTEME DE MASURARE
  ═══════════════════════════════════════════════════════════════════════════════

  Edinio are DOUA sisteme care nu au voie sa se amestece:

    A. PLATFORMA  — cu ce ne masuram NOI site-ul de prezentare si palnia noastra.
                    `src/components/platform/*`. Id-urile sunt ale Edinio.
    B. COMERCIANT — pixelii si etichetele pe care si le pune fiecare client pe
                    magazinul lui. `src/lib/marketing.ts`, `components/public/*`.
                    Id-urile sunt ale LUI.

  ⚠ CE S-A GASIT PE 01.09.2026, si de ce exista fisierul asta. Doua ecrane din
  panou (`FacebookPixelConfigClient`, `TikTokPixelConfigClient`) importau doua
  functii curate din `@/lib/marketing` — dar modulul acela are un EFECT LA
  INCARCARE, deci aducea cu el tot runtime-ul comerciantului. Iar ecranele acelea
  stau sub `(dashboard)/layout.tsx`, unde `window.fbq` e al NOSTRU.

  Niciun eveniment n-a plecat gresit: nimeni nu cheama un tracker din panou. Dar
  `ready("fb")` se uita doar la `typeof window.fbq === "function"` — deci primul
  `fbTrack(...)` scris vreodata intr-o componenta de panou ar fi plecat tacut in
  contul Meta al Edinio, sub numele unui comerciant. Nimic nu-l oprea, si nimic
  n-ar fi cazut.

  ⚠ CE PAZESC PROBELE, SI CE NU. Se uita la importurile DIRECTE. Un lant lung
  (A importa B care importa runtime-ul) le-ar scapa. E limita metodei, spusa pe
  fata — dar defectul gasit era direct, si asa sunt aproape toate.
*/

const RAD = process.cwd();

function fisiereDin(dir: string): string[] {
  const out: string[] = [];
  const mers = (d: string) => {
    let intrari;
    try { intrari = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of intrari) {
      const p = join(d, it.name);
      if (it.isDirectory()) mers(p);
      else if (/\.tsx?$/.test(it.name) && !/\.test\.tsx?$/.test(it.name)) out.push(p);
    }
  };
  mers(join(RAD, dir));
  return out;
}

const citeste = (p: string) => readFileSync(p, "utf8");
const scurt = (p: string) => p.slice(RAD.length + 1).split(sep).join("/");

/** Fisierele din `zone` care importa ceva ce se potriveste cu `tipar`. */
function importa(zone: string[], tipar: RegExp): string[] {
  const gasite: string[] = [];
  for (const z of zone) {
    for (const f of fisiereDin(z)) {
      const s = citeste(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const m of s.matchAll(/from\s+"([^"]+)"/g)) {
        if (tipar.test(m[1])) { gasite.push(`${scurt(f)}  ->  ${m[1]}`); break; }
      }
    }
  }
  return gasite;
}

/* ═══ 1. Runtime-ul comerciantului nu intra in documentele noastre ═══ */

test("⚠ nimic din panou/admin/prezentare nu importa runtime-ul comerciantului", () => {
  /*
    `@/lib/marketing` (fara `-config`) e runtime-ul: coada, trackerele, si IIFE-ul
    care instaleaza `window.__edinioFlushQueue`. El are voie DOAR in magazine.

    Cine are nevoie de un analizor de id sau de o normalizare ia din
    `@/lib/marketing-config`, care e curat.
  */
  const vinovati = importa(
    ["src/components/dashboard", "src/components/admin", "src/components/website", "src/lib/website"],
    /^@\/lib\/marketing$/,
  );
  assert.deepEqual(
    vinovati, [],
    "runtime-ul de urmarire al comerciantului a ajuns intr-un document masurat de\n" +
    "pixelii NOSTRI. Ia din `@/lib/marketing-config` daca ai nevoie doar de un\n" +
    "analizor de id:\n  " + vinovati.join("\n  "),
  );
});

test("⚠ pixelii PLATFORMEI nu ajung in magazinele comerciantilor", () => {
  /*
    Cealalta directie, si e mai grava: pixelul NOSTRU pornit pe magazinul unui
    client ar trimite in contul nostru de reclame cumparaturile lui.
  */
  const vinovati = importa(
    ["src/components/storefront", "src/components/ministore", "src/components/public", "src/lib/storefront"],
    /^@\/components\/platform\//,
  );
  assert.deepEqual(vinovati, [], "un pixel al platformei a ajuns in magazinul unui comerciant:\n  " + vinovati.join("\n  "));
});

test("⚠ grupul de rute al magazinelor nu randeaza nimic al platformei", () => {
  const vinovati = importa(["src/app/(public)"], /^@\/components\/platform\//);
  assert.deepEqual(vinovati, [], "grupul (public) a capatat un tracker al platformei:\n  " + vinovati.join("\n  "));
});

/* ═══ 2. Efectul la incarcare — probat prin CHEMARE, nu prin citire ═══ */

test("`marketing-config` NU atinge `window` la incarcare", async () => {
  /*
    ⚠ ASTA E PROBA CARE CONTEAZA CEL MAI MULT, si singura de aici care executa.
    Toata despartirea se sprijina pe faptul ca modulul curat e CURAT. Daca cineva
    ii adauga vreodata un efect, importurile din panou redevin ce erau — si nicio
    proba care citeste sursa n-ar observa.
  */
  const g = globalThis as unknown as Record<string, unknown>;
  const martor: Record<string, unknown> = {};
  g.window = martor;

  await import("./marketing-config");

  assert.deepEqual(
    Object.keys(martor), [],
    "`marketing-config` a scris pe `window` la incarcare: " + Object.keys(martor).join(", "),
  );
});

test("`marketing` (runtime) CHIAR isi instaleaza scurgerea cozii", async () => {
  /*
    Martorul celeilalte jumatati. Daca proba asta cade, efectul a disparut din
    runtime — iar atunci pixelii comerciantului nu-si mai golesc coada si
    conversiile se pierd tacut, exact defectul pentru care a fost scrisa coada.
  */
  const g = globalThis as unknown as Record<string, unknown>;
  const martor: Record<string, unknown> = {};
  g.window = martor;

  await import("./marketing");

  assert.ok(
    typeof martor.__edinioFlushQueue === "function",
    "runtime-ul nu mai instaleaza `__edinioFlushQueue` — coada nu se mai goleste",
  );
});

/* ═══ 3. Martorul: zonele chiar exista si chiar se citesc ═══ */

test("martor: probele se uita la dosare care exista si nu sunt goale", () => {
  /*
    Fara asta, o cale scrisa gresit ar face fiecare proba de mai sus sa treaca
    verde pe o lista goala — adica sa pazeasca nimic, foarte convingator.
  */
  /*
    ⚠ PRAGURI PE ZONA, nu unul singur. Prima forma cerea „peste 5 fisiere" peste
    tot si a cazut pe `components/platform`, care are exact TREI: `PlatformEvent`,
    `PlatformMetaPixel`, `PlatformTikTokPixel`. Nu era un defect, era pragul meu
    ales din burta — dar martorul si-a facut treaba: a oprit o proba care se
    sprijinea pe o presupunere.

    Trei e si o cifra care merita pazita: daca dosarul creste mult, tot ce e nou
    acolo masoara platforma si trebuie sa treaca prin aceleasi granite.
  */
  const MINIM: Record<string, number> = {
    "src/components/dashboard": 20,
    "src/components/storefront": 20,
    "src/components/platform": 3,
    "src/app/(public)": 10,
  };
  for (const [z, minim] of Object.entries(MINIM)) {
    const n = fisiereDin(z).length;
    assert.ok(n >= minim, `zona ${z} are ${n} fisiere, sub minimul de ${minim} — calea e gresita?`);
  }
  /* Si ca despartirea chiar exista pe disc. */
  assert.match(citeste("src/lib/marketing.ts"), /installFlush/, "runtime-ul si-a pierdut efectul");
  assert.doesNotMatch(citeste("src/lib/marketing-config.ts"), /installFlush/, "efectul a ajuns in modulul curat");
});
