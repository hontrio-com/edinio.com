#!/usr/bin/env node
/*
  ═══════════════════════════════════════════════════════════════════════════
  SURSELE FOII DE STIL A VITRINEI (`src/app/vitrina.css`)             (19.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Foaia magazinelor genereaza utilitare Tailwind DOAR din fisierele la care ajung rutele magazinului prin importuri
  (`vitrina-surse.css`, scris de aici). Pana la auditul temelor, magazinele incarcau foaia aplicatiei (`globals.css`),
  care scaneaza tot proiectul: 338 KB (52 KB gzip) de utilitare, cele mai multe ale panoului, descarcate inaintea primei
  afisari a fiecarui magazin.

  Lista e DERIVATA din importuri, nu tinuta minte: un fisier nou importat de vitrina si nelistat ar ramane fara
  utilitarele lui, iar pagina ar aparea nestilizata exact pe clasele noi, fara nicio eroare. `foi-de-stil.test.ts`
  reface lista si cade cand fisierul scris a ramas in urma.

      node scripts/foaie-vitrina.mjs            verifica (iesire 1 daca `vitrina-surse.css` nu e la zi)
      node scripts/foaie-vitrina.mjs --scrie    rescrie `vitrina-surse.css`

  Fara dependente: doar `node:fs` si `node:path`, ca proba sa-l poata importa.
*/
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(RAD, "src");
const APP = path.join(SRC, "app");
export const FISIER_SURSE = path.join(APP, "vitrina-surse.css");

/**
 * De unde pornesc rutele magazinului: tot grupul `(public)` (vitrina, previzualizarea sectiunilor) si `app/layout.tsx`,
 * care randeaza `<html>` si `<body>` in acelasi document.
 *
 * ⚠ `(public)` intra ca DOSAR, nu fisier cu fisier: caile lui poarta `[slug]`, iar Tailwind citeste `@source` ca tipar
 * (`[slug]` ar insemna „o litera din s, l, u, g”, deci fisierul nu s-ar mai gasi, in tacere).
 */
const DOSARE_DE_PORNIRE = [path.join(APP, "(public)")];
const FISIERE_DE_PORNIRE = [path.join(APP, "layout.tsx")];

const COD = /\.(tsx?|jsx?|mjs)$/;
const PROBA = /\.test\.[a-z]+$/;

function fisiereDin(dosar, acc = []) {
  for (const e of readdirSync(dosar, { withFileTypes: true })) {
    const p = path.join(dosar, e.name);
    if (e.isDirectory()) fisiereDin(p, acc);
    else if (COD.test(e.name) && !PROBA.test(e.name)) acc.push(p);
  }
  return acc;
}

const esteFisier = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

function rezolva(dela, specificator) {
  let baza;
  if (specificator.startsWith("@/")) baza = path.join(SRC, specificator.slice(2));
  else if (specificator.startsWith(".")) baza = path.resolve(path.dirname(dela), specificator);
  else return null; // pachet din node_modules: clasele lui nu sunt ale noastre
  const candidate = [baza, ...[".tsx", ".ts", ".jsx", ".js", ".mjs"].map((x) => baza + x), ...["index.tsx", "index.ts", "index.js"].map((x) => path.join(baza, x))];
  return candidate.find(esteFisier) ?? null;
}

/** Orice forma de import: `from "x"`, `import "x"`, `import("x")`, `require("x")`, `export ... from "x"`. */
const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g;

/** Toate fisierele de cod la care ajung rutele magazinului, sortate, ca drumuri absolute. */
export function fisiereleVitrinei() {
  const vazute = new Set();
  const coada = [...DOSARE_DE_PORNIRE.flatMap((d) => fisiereDin(d)), ...FISIERE_DE_PORNIRE];
  while (coada.length) {
    const f = coada.pop();
    if (vazute.has(f)) continue;
    vazute.add(f);
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const r = rezolva(f, m[1]);
      if (r && COD.test(r) && !PROBA.test(r) && !vazute.has(r)) coada.push(r);
    }
  }
  return [...vazute].sort();
}

const relativ = (p) => path.relative(APP, p).split(path.sep).join("/");

/** Randurile `@source` ale foii: dosarele de pornire intregi, apoi fiecare fisier din afara lor. */
export function surseleVitrinei() {
  const dosare = DOSARE_DE_PORNIRE.map(relativ);
  const inDosar = (f) => DOSARE_DE_PORNIRE.some((d) => f.startsWith(d + path.sep));
  const fisiere = fisiereleVitrinei().filter((f) => !inDosar(f)).map(relativ);
  const cuTipar = fisiere.filter((f) => /[[\]{}*?!]/.test(f));
  if (cuTipar.length) {
    throw new Error("Cai cu caractere de tipar; Tailwind le-ar citi ca tipare, nu ca fisiere:\n  " + cuTipar.join("\n  "));
  }
  return [...dosare, ...fisiere];
}

export function continutulFisierului() {
  const surse = surseleVitrinei();
  return [
    "/*",
    "  GENERAT de `scripts/foaie-vitrina.mjs --scrie`. NU se editeaza de mana.",
    "",
    "  Fisierele din care foaia vitrinei (`vitrina.css`) isi genereaza utilitarele Tailwind: tot ce importa, direct sau",
    "  prin alte fisiere, rutele magazinului. Dupa un import nou in vitrina, se rescrie; `foi-de-stil.test.ts` cade",
    "  cand a ramas in urma.",
    "*/",
    ...surse.map((s) => `@source "${s.startsWith(".") ? s : "./" + s}";`),
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const nou = continutulFisierului();
  const vechi = existsSync(FISIER_SURSE) ? readFileSync(FISIER_SURSE, "utf8").replace(/\r\n/g, "\n") : null;
  const randuri = nou.split("\n").filter((l) => l.startsWith("@source")).length;
  if (process.argv.includes("--scrie")) {
    writeFileSync(FISIER_SURSE, nou);
    console.log(`vitrina-surse.css scris: ${randuri} surse${vechi === nou ? " (neschimbat)" : ""}`);
  } else if (vechi === nou) {
    console.log(`vitrina-surse.css e la zi: ${randuri} surse`);
  } else {
    console.error("vitrina-surse.css a ramas in urma importurilor vitrinei. Ruleaza: node scripts/foaie-vitrina.mjs --scrie");
    process.exitCode = 1;
  }
}
