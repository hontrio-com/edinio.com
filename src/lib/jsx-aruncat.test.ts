import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  JSX SCRIS ÎN AFARA LUI `return` SE EVALUEAZĂ ȘI SE ARUNCĂ
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E O PROBĂ ȘI NU DOAR O REGULĂ DE LINT. Regula există — am pornit
  `@typescript-eslint/no-unused-expressions` în `eslint.config.mjs` în aceeași zi.
  Dar `npm run lint` e ROȘU de mult: 81 de erori vechi, mai ales `no-explicit-any`.
  Într-o listă deja roșie, a 82-a eroare nu se vede. Regula prinde defectul; ea
  singură nu-l OPREȘTE.

  Suita de probe, în schimb, e verde. O eroare nouă aici se vede imediat.

  ⚠ CE PRINDE. Forma asta, care a stat în producție pe toate patru paginile
  legale:

      export default function CookiesPage() {
        {jsonLd ? <script type="application/ld+json" … /> : null}
        return <PaginaLegal doc={COOKIES} />;
      }

  `{…}` la început de instrucțiune e un bloc, nu JSX. Ce e înăuntru se
  evaluează și se aruncă. `tsc` trece, build-ul trece, pagina arată bine — și
  datele structurate nu ajung niciodată în ea. Măsurat pe edinio.com înainte de
  reparație: 2 blocuri ld+json pe paginile legale față de 6 pe /preturi.

  ⚠ CÂND CADE, nu muta rândul „mai jos". Mută-l ÎNĂUNTRUL lui `return`.
*/

const REGULA = "@typescript-eslint/no-unused-expressions";

/*
  ⚠ SE CHEAMA BINARUL JS DIRECT, NU `npx`. Pe Windows, Node 24 refuza sa porneasca
  fisiere `.cmd` prin `spawnSync` fara shell (EINVAL), iar `npx.cmd` e exact asta.
  `process.execPath` + calea catre `bin/eslint.js` merge la fel pe toate sistemele
  si sare si peste rezolvarea lui npx, care costa cateva sute de milisecunde.
*/
const ESLINT = join(process.cwd(), "node_modules", "eslint", "bin", "eslint.js");

test("nu există JSX evaluat și aruncat în `src/`", () => {
  let iesire = "";
  try {
    iesire = execFileSync(
      process.execPath,
      [ESLINT, "src", "--format", "json"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    /*
      ⚠ ESLint IESE CU 1 CÂND GĂSEȘTE ORICE EROARE — inclusiv cele 81 vechi, care
      nu ne privesc aici. Deci ieșirea nenulă NU e semnalul; ce contează e ce
      scrie în JSON. Fără `catch`-ul ăsta proba ar fi căzut mereu, din alt motiv,
      și ar fi fost dezactivată de cineva în două zile.
    */
    const err = e as { stdout?: string };
    iesire = err.stdout ?? "";
  }

  assert.ok(iesire.trim().length > 0, "eslint n-a scos nimic — comanda nu a rulat");

  const rezultate = JSON.parse(iesire) as Array<{
    filePath: string;
    messages: Array<{ ruleId: string | null; line: number; message: string }>;
  }>;

  assert.ok(rezultate.length > 0, "eslint n-a analizat niciun fișier — s-a schimbat configurația?");

  const vinovate = rezultate.flatMap((r) =>
    r.messages
      .filter((m) => m.ruleId === REGULA)
      .map((m) => `${r.filePath.split(/[\\/]/).slice(-3).join("/")}:${m.line}`),
  );

  assert.deepEqual(
    vinovate,
    [],
    "JSX (sau altă expresie) scris ca instrucțiune de sine stătătoare — se " +
      "evaluează și se aruncă, fără nicio eroare. Mută-l ÎNĂUNTRUL lui `return`:\n  " +
      vinovate.join("\n  "),
  );
});

test("martor: regula chiar e pornită în configurație", () => {
  /*
    ⚠ Fără rândul ăsta, proba de sus ar fi verde și dacă cineva scoate regula din
    `eslint.config.mjs` — n-ar mai raporta nicio încălcare, fiindcă n-ar mai
    exista regula. Zero rezultate arată la fel ca „totul e în regulă".
  */
  const config = execFileSync(
    process.execPath,
    [ESLINT, "--print-config", "src/app/layout.tsx"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const reguli = (JSON.parse(config) as { rules: Record<string, unknown> }).rules;
  const val = reguli[REGULA];

  /*
    ⚠ „EXISTĂ" NU E DE-AJUNS, ȘI AM AFLAT-O CONFRUNTÂND. Prima formă a probei
    ăsteia cerea doar `!== undefined`. Am scos regula din `eslint.config.mjs` ca
    s-o confrunt — și a trecut. Motivul: `eslint-config-next` o dă oricum, dar pe
    severitatea 1, AVERTISMENT.

    Ăsta e chiar motivul pentru care defectul a trăit luni de zile: era raportat,
    ca al 125-lea avertisment dintr-o listă pe care n-o citește nimeni. Deci ce
    trebuie apărat nu e existența regulii, ci severitatea ei.
  */
  const severitate = Array.isArray(val) ? val[0] : val;
  assert.ok(
    severitate === 2 || severitate === "error",
    `\`${REGULA}\` e pe severitatea ${JSON.stringify(severitate)}, nu pe eroare. ` +
      "Ca avertisment se pierde între celelalte 124 — exact cum s-a pierdut " +
      "defectul de pe cele patru pagini legale. Pune-o la loc pe `error` în " +
      "`eslint.config.mjs`, unde e scris și de ce.",
  );
});
