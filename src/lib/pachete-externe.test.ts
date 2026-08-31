import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
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

    1. niciun pachet extern nu ajunge la o dependință DOAR-ESM — asta e plasa
       care chiar prinde incidentul, confruntată instalând într-adevăr 2.17.7;
    2. `sanitize-html` are versiune FIXĂ, nu un interval;
    3. fiecare pachet extern se încarcă (util, dar NU reproduce incidentul —
       vezi nota de la proba respectivă).

  ⚠ PLASA A FOST GREȘITĂ DE DOUĂ ORI ÎNAINTE SĂ PRINDĂ, și amândouă greșelile
  merită ținute minte, fiindcă amândouă arătau VERDE:

    * prima măsura `require()` gol al lui Node — care pe Node 24 reușește și pe
      pachete doar-ESM, deci nu putea pica niciodată;
    * a doua rezolva dependințele din rădăcina depozitului, unde stă copia bună,
      în loc de cea cuibărită sub pachetul vinovat.

  De fiecare dată am aflat-o instalând cu adevărat 2.17.7 și uitându-mă dacă
  proba pică. O plasă nouă care n-a fost pusă lângă defect nu e o plasă.

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
  test(`\`${nume}\` se poate încărca`, () => {
    /*
      ⚠ PROBA ASTA NU REPRODUCE INCIDENTUL, ȘI E BINE SĂ SE ȘTIE.

      Am scris aici, pe 31.08.2026, că „`require`, ANUME, nu `import` … iar
      `ERR_REQUIRE_ESM` apare numai pe drumul acela". AM VERIFICAT ȘI E FALS:
      Node 24 are `require(esm)` pornit implicit, deci `require()` REUȘEȘTE pe
      pachete doar-ESM. Probat pe cinci din `node_modules` — toate trec.

      Producția n-a căzut pe încărcătorul lui Node, ci pe al lui Turbopack:
      `at Context.externalRequire (.next/server/chunks/[turbopack]_runtime.js:704)`.
      Același Node major în amândouă locurile.

      Deci rândul de mai jos verifică doar că pachetul EXISTĂ și se încarcă —
      util, dar nu e plasa pentru ce s-a întâmplat. Plasa aceea e proba
      următoare, care se uită la FORMA dependințelor.
    */
    assert.doesNotThrow(() => cere(nume), `${nume} nu se poate încărca deloc`);
  });
}

/**
 * Niciun pachet extern nu poate ajunge la o dependință DOAR-ESM.
 *
 * ⚠ ASTA AR FI PRINS CĂDEREA DIN 30.08.2026, iar proba de deasupra nu.
 *
 * `sanitize-html` 2.17.7 aduce `htmlparser2` 12, care e `"type": "module"` și
 * al cărui `exports["."]` n-are ramură `require` — adică nu se poate încărca pe
 * drumul CommonJS pe care Next îl folosește pentru pachetele externalizate.
 * Versiunea 10, cea de acum, are build DUBLU (`import` ȘI `require`), de aceea
 * merge.
 *
 * Deosebirea se vede în `package.json`, fără să rulezi nimic. Deci se poate
 * verifica aici, ieftin, la fiecare `npm test`.
 */
test("niciun pachet extern nu depinde de ceva doar-ESM", () => {
  const doarEsm: string[] = [];

  /*
    ⚠ SE REZOLVĂ DIN PĂRINTE, NU DIN RĂDĂCINĂ — și asta e chiar miezul probei.

    Prima variantă a mea rezolva fiecare dependință din rădăcina depozitului. Am
    confruntat-o instalând într-adevăr 2.17.7: proba a TRECUT, deși pachetul
    stricat era acolo. Motivul: npm îl pusese cuibărit, la
    `node_modules/sanitize-html/node_modules/htmlparser2` (v12, doar-ESM), în timp
    ce rădăcina păstra v10 (dual) pentru `@types/sanitize-html`. Rezolvând din
    rădăcină, vedeam mereu copia bună.

    Cuibărirea nu e un amănunt: e chiar felul în care arăta incidentul —
    `/var/task/node_modules/sanitize-html/node_modules/htmlparser2/dist/index.js`.
  */
  /*
    ⚠ SE CAUTĂ PE DISC, NU PRIN `require.resolve`. A doua variantă a mea o
    folosea pe aceea și tot trecea cu 2.17.7 instalat. Cauza: `htmlparser2` nu-și
    exportă `package.json`, deci `require.resolve("htmlparser2/package.json")`
    aruncă `ERR_PACKAGE_PATH_NOT_EXPORTED`, iar `catch`-ul înghițea exact cazul
    de dovedit. Proba n-a deschis niciodată pachetul pe care trebuia să-l judece.

    Umblatul pe `node_modules` e mai prost la vedere, dar nu poate fi oprit de
    `exports` — și tocmai `exports` e ce vrem să citim.
  */
  const cautaPachet = (dirParinte: string, nume: string): string | null => {
    let d = dirParinte;
    for (let i = 0; i < 12; i++) {
      const p = join(d, "node_modules", ...nume.split("/"), "package.json");
      if (existsSync(p)) return p;
      const sus = dirname(d);
      if (sus === d) break;
      d = sus;
    }
    return null;
  };

  const cerceteaza = (numePachet: string, adancime: number, vazute: Set<string>, dirParinte: string) => {
    const cheie = `${dirParinte}>${numePachet}`;
    if (adancime > 3 || vazute.has(cheie)) return;
    vazute.add(cheie);

    const caleaPkg = cautaPachet(dirParinte, numePachet);
    if (!caleaPkg) return;

    let pkg: { type?: string; exports?: unknown; dependencies?: Record<string, string> };
    try {
      pkg = JSON.parse(readFileSync(caleaPkg, "utf8")) as typeof pkg;
    } catch {
      return;
    }

    const exp = pkg.exports as Record<string, unknown> | string | undefined;
    const radacina = exp && typeof exp === "object" ? (exp as Record<string, unknown>)["."] : undefined;
    const areRequire =
      typeof radacina === "object" && radacina !== null && "require" in (radacina as object);

    if (pkg.type === "module" && radacina && !areRequire) doarEsm.push(numePachet);

    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      cerceteaza(dep, adancime + 1, vazute, dirname(caleaPkg));
    }
  };

  for (const extern of pachetele()) cerceteaza(extern, 0, new Set(), process.cwd());

  assert.deepEqual(
    doarEsm,
    [],
    `pachete doar-ESM sub un pachet extern: ${doarEsm.join(", ")}. ` +
      "Next le cere pe drumul CommonJS la rulare, iar build-ul NU o semnalează. " +
      "Vezi nota de la începutul fișierului.",
  );
});

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
  Lockfile-ul tine DOUA lucruri deosebite: versiunea rezolvata (in
  `packages["node_modules/x"].version`) SI cererea copiata din package.json, in
  `packages[""].dependencies`. Editand package.json de mana, a doua ramane in urma.

  ⚠ AM SCRIS INTAI AICI CA „`npm ci` CADE ATUNCI, DECI AR FI OPRIT DESFASURAREA".
  AM VERIFICAT, SI E FALS. Cu `package.json` cerand `2.17.5` si lockfile-ul
  pastrand `^2.17.5` in `packages[""].dependencies`, `npm ci` iese cu 0 si nu
  spune nimic — fiindca versiunea rezolvata (2.17.5) SATISFACE cererea. `npm ci`
  se supara abia cand cererea nu poate fi implinita deloc: `ETARGET` pentru o
  versiune inexistenta, `E404` pentru un pachet care nu exista.

  Deci proba asta NU e o paza a desfasurarii. E o paza a INTELESULUI: doua
  fisiere care spun lucruri diferite despre aceeasi dependinta il pun pe
  urmatorul cititor sa se intrebe care e adevarul, si fac ca `git diff` sa arate
  zgomot la prima comanda npm care le sincronizeaza singura.

  Se repara cu `npm install --package-lock-only`.
*/
test("lockfile-ul repeta aceeasi cerere ca package.json", () => {
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
