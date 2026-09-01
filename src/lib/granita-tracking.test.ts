import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  GRANITA DINTRE CELE DOUA SISTEME DE MASURARE
  ═══════════════════════════════════════════════════════════════════════════════

  Edinio are DOUA sisteme care nu au voie sa se amestece:

    A. EDINIO     — cu ce ne masuram NOI site-ul de prezentare si palnia noastra.
                    `src/{components,lib}/edinio-marketing/*`. Id-urile sunt ale Edinio.
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

/*
  Masurarea NOASTRA, oriunde ar sta ea. Un singur tipar, folosit de amandoua
  probele de despartire.

  ⚠ SE NUMEA `@/components/platform/`, si dosarul acela nu mai exista din
  01.09.2026. Cele doua probe ar fi trecut de atunci VERDE PE GOL: niciun fisier
  nu poate importa dintr-un dosar care nu e nicaieri, deci lista de vinovati ar fi
  fost mereu vida si granita ar fi parut pazita.

  De aceea exista si martorul de mai jos, care cere ca tiparul sa CHIAR se
  potriveasca undeva.
*/
const ZONA_EDINIO = /^@\/(components|lib)\/edinio-marketing\//;

/* ═══ 1. Runtime-ul comerciantului nu intra in documentele noastre ═══ */

test("martor: tiparul `edinio-marketing` chiar se potriveste pe ceva", () => {
  /*
    ⚠ FARA ASTA, cele doua probe de despartire sunt teatru. Ele dovedesc ca
    NIMENI din magazine nu importa masurarea noastra — o afirmatie care e
    adevarata si cand tiparul e scris gresit si nu se potriveste nicaieri.

    Aici se cere opusul: in propriile noastre suprafete, importurile EXISTA. Daca
    proba asta cade, tiparul e stricat, si tot ce se sprijina pe el nu mai
    pazeste nimic.
  */
  const alenoastre = importa(["src/app/(website)", "src/app/(onboarding)"], ZONA_EDINIO);
  assert.ok(
    alenoastre.length >= 3,
    "tiparul ZONA_EDINIO nu s-a potrivit nicaieri in suprafetele NOASTRE — " +
    "e scris gresit, si probele de granita trec pe gol:\n  " + alenoastre.join("\n  "),
  );
});

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
    ZONA_EDINIO,
  );
  assert.deepEqual(vinovati, [], "un pixel al Edinio a ajuns in magazinul unui comerciant:\n  " + vinovati.join("\n  "));
});

test("⚠ grupul de rute al magazinelor nu randeaza nimic al platformei", () => {
  const vinovati = importa(["src/app/(public)"], ZONA_EDINIO);
  assert.deepEqual(vinovati, [], "grupul (public) a capatat un tracker al Edinio:\n  " + vinovati.join("\n  "));
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
    tot si a cazut pe un dosar care avea exact trei. Nu era un defect, era pragul
    meu ales din burta — dar martorul si-a facut treaba: a oprit o proba care se
    sprijinea pe o presupunere.

    ⚠ SI PRAGURILE SUNT SUB NUMARUL DE AZI, dinadins. Ele pazesc CALEA, nu
    marimea: o cale scrisa gresit da zero si cade. Un prag pus fix pe numarul de
    azi ar cadea la fiecare fisier sters — adica ar cere intretinere fara sa
    prinda nimic.
  */
  const MINIM: Record<string, number> = {
    "src/components/dashboard": 20,
    "src/components/storefront": 20,
    "src/components/edinio-marketing": 5,
    "src/lib/edinio-marketing": 5,
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
