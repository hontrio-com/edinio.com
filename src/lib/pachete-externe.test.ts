import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/*
  ═══════════════════════════════════════════════════════════════════════════
  PACHETELE DIN `serverExternalPackages` NU INTRĂ ÎN BUILD (30.08.2026)
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ ASTA A DOBORÂT PLATFORMA, NU BLOGUL, ȘI BUILD-UL A FOST VERDE.

  Am urcat `sanitize-html` de la 2.17.5 la 2.17.7. Versiunea nouă aduce
  `htmlparser2` ca ESM, iar pachetul e listat în `serverExternalPackages`, deci
  Next NU îl împachetează — îl cere cu `require()` abia la RULARE. `next build`
  n-a avut ce să observe.

  Măsurat în producție: 56 de erori, 21 de oameni, între 22:15:52 și 22:23:30.
  Au căzut vitrinele `/[slug]`, paginile de produs, `/dashboard`, `proxy`-ul și
  cronul de eMAG. Blogul, care era motivul urcării, n-a fost printre ele.

  Probele de aici sunt plasa pe care n-o aveam atunci:

    1. fiecare pachet extern se poate CERE cu adevărat, aici, acum;
    2. `sanitize-html` are versiune FIXĂ, nu un interval.

  ⚠ DE CE PUNCTUL 2 E O EXCEPȚIE. Tot restul depozitului folosește `^`, și e
  bine așa. Pachetul ăsta e altfel fiindcă are un incident scris: știm care
  versiune cade și de ce. Cu `^2.17.5`, un `npm update` sau un robot de
  actualizări ar readuce tăcut 2.17.7 — exact versiunea pe care documentația
  proiectului spune că am scos-o din producție.
*/

const cere = createRequire(import.meta.url);

/** Numele pachetelor din `serverExternalPackages`, citite din configul adevărat. */
function pachetele(): string[] {
  /* Terminațiile de linie se normalizează: pe Windows fișierul are CRLF, iar o
     potrivire care nu ține cont de asta pică tăcut. S-a mai întâmplat. */
  const config = readFileSync("next.config.ts", "utf8").split("\r\n").join("\n");
  /* Fara steagul `s`: tinta proiectului nu-l ingaduie, iar `[^\]]*` cuprinde
     oricum saltul de rand — punctul nici nu apare in tipar. */
  const bloc = /serverExternalPackages:\s*\[([^\]]*)\]/.exec(config);
  assert.ok(bloc, "nu am gasit `serverExternalPackages` in next.config.ts");
  return [...bloc[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("configul chiar are pachete externe (altfel probele de mai jos n-ar pazi nimic)", () => {
  const p = pachetele();
  assert.ok(p.length > 0, "lista e goala — s-a mutat sau s-a redenumit?");
});

for (const nume of pachetele()) {
  test(`\`${nume}\` se poate cere la rulare, nu doar construi`, () => {
    /*
      ⚠ `require`, ANUME, nu `import`. Next îl cere pe drumul CommonJS la rulare,
      iar `ERR_REQUIRE_ESM` apare numai pe drumul acela — un `import` dinamic ar
      reuși și pe un pachet care în producție ar cădea.
    */
    assert.doesNotThrow(() => cere(nume), `${nume} nu se poate cere — vezi nota de sus`);
  });
}

test("sanitize-html are versiune fixa, fara `^`", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const ceruta = pkg.dependencies?.["sanitize-html"];
  assert.ok(ceruta, "sanitize-html nu mai e in dependencies");
  assert.ok(
    !/[\^~><*]|\s-\s/.test(ceruta),
    `sanitize-html e cerut ca "${ceruta}" — un interval poate readuce 2.17.7, ` +
      "versiunea care a doborat platforma. Vezi nota de la inceputul fisierului.",
  );
});

test("versiunea instalata e chiar cea ceruta", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const instalata = cere("sanitize-html/package.json").version;
  assert.equal(
    instalata,
    pkg.dependencies["sanitize-html"],
    "lockfile-ul si package.json nu spun acelasi lucru",
  );
});

/*
  ⚠ PROBA ASTA S-A NASCUT DINTR-O GRESEALA DE-A MEA, LA CATEVA MINUTE DUPA CE AM
  SCRIS-O PE CEA DE DEASUPRA (31.08.2026).

  Am schimbat `^2.17.5` in `2.17.5` in `package.json` si am crezut ca am terminat:
  lockfile-ul avea deja 2.17.5 REZOLVAT, deci totul parea in regula, si toate
  probele erau verzi.

  Dar lockfile-ul tine DOUA lucruri deosebite: versiunea rezolvata (in
  `packages["node_modules/x"].version`) SI cererea din package.json, copiata in
  `packages[""].dependencies`. A doua ramasese `^2.17.5`.

  `npm ci` — care e ce ruleaza Vercel — cade cand cele doua nu se potrivesc. Deci
  „reparatia" mea ar fi oprit desfasurarea, iar nimic din ce rulez local n-ar fi
  spus-o: `npm test`, `tsc`, `eslint` si chiar `npm run build` trec toate, fiindca
  niciunul nu se uita la potrivirea asta.

  Se repara cu `npm install --package-lock-only`.
*/
test("lockfile-ul repeta aceeasi cerere ca package.json (altfel `npm ci` cade)", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const cerute = { ...pkg.dependencies, ...pkg.devDependencies };
  const inLock = {
    ...lock.packages?.[""]?.dependencies,
    ...lock.packages?.[""]?.devDependencies,
  };

  const nepotrivite = Object.entries(cerute)
    .filter(([nume, spec]) => inLock[nume] !== spec)
    .map(([nume, spec]) => `${nume}: package.json "${spec}" vs lockfile "${inLock[nume]}"`);

  assert.deepEqual(
    nepotrivite,
    [],
    "package.json si package-lock.json nu cer acelasi lucru — ruleaza `npm install --package-lock-only`",
  );
});
