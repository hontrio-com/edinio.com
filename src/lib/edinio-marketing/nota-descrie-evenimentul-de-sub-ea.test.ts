import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NUME_TAXONOMIE } from "./evenimente";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  NOTA DE DEASUPRA UNUI EVENIMENT TREBUIE SA VORBEASCA DESPRE ACEL EVENIMENT
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DEFECTUL CARE A NASCUT-O, si e al treilea de acelasi fel intr-o saptamana.

  Pe 03.09.2026 `add_payment_info` a fost scos din pagina de planuri si inlocuit cu
  `begin_checkout`. Evenimentul s-a schimbat; NOTA de deasupra lui n-a fost atinsa.

  A ramas deci un comentariu care, stand deasupra unui `begin_checkout`:
    - explica de ce se pastreaza numele `AddPaymentInfo` la Meta;
    - descria clipa ca fiind „l-am predat lui Stripe, nu a introdus cardul";
    - si sustinea ca evenimentul „nu duce nici `value`, nici `currency`" — la doua
      randuri de un apel care duce amandoua.

  Nimic n-a cazut. Codul era corect si nota minteaza, iar cine ar fi citit-o peste
  sase luni ar fi luat hotarari pe ea. Un audit din afara a gasit-o inaintea mea.

  ⚠ CE PROBEAZA RANDURILE ASTEA. Nu ca nota e buna — asta nu se poate masura. Ci ca
  nota de deasupra unui eveniment il NUMESTE. Daca vorbeste numai despre ALTE
  evenimente din taxonomie, atunci sigur descrie altceva decat ce se trimite.

  ⚠ SI DE CE E O REGULA CINSTITA, nu una care interzice sa scrii despre trecut.
  O nota are voie sa pomeneasca oricate alte evenimente — istoricul e chiar ce
  lipseste de obicei din cod. Se cere doar ca, printre ele, sa fie si al ei.
*/

const NUME = new Set<string>(NUME_TAXONOMIE);

function fisiere(dir: string): string[] {
  const out: string[] = [];
  for (const it of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, it.name).replace(/\\/g, "/");
    if (it.isDirectory()) { out.push(...fisiere(p)); continue; }
    if (/\.tsx?$/.test(it.name) && !/\.test\.tsx?$/.test(it.name)) out.push(p);
  }
  return out;
}

/**
 * Blocul de comentariu lipit imediat deasupra pozitiei date.
 *
 * ⚠ „LIPIT" INSEAMNA FARA COD INTRE ELE. Un `/* … *​/` urmat de trei instructiuni
 * si abia apoi de `urmareste` nu e nota lui — si daca l-as socoti al lui, proba
 * ar cere ca fiecare bloc din fisier sa numeasca evenimentul de mai jos.
 */
function notaDeDeasupra(cod: string, i: number): string | null {
  const inainte = cod.slice(0, i);
  const j = inainte.lastIndexOf("*/");
  if (j < 0) return null;
  /* Intre sfarsitul notei si eveniment n-are voie sa stea decat spatiu. */
  if (inainte.slice(j + 2).trim() !== "") return null;
  const k = inainte.lastIndexOf("/*", j);
  if (k < 0) return null;
  return inainte.slice(k, j + 2);
}

test("⚠ nota de deasupra unui eveniment il NUMESTE, nu descrie altul", () => {
  const vinovate: string[] = [];

  for (const f of fisiere("src")) {
    const cod = readFileSync(f, "utf8");
    for (const m of cod.matchAll(/urmareste\(\{\s*\r?\n?\s*name:\s*"([a-z_]+)"/g)) {
      const nume = m[1];
      const nota = notaDeDeasupra(cod, m.index!);
      if (!nota) continue;

      /*
        ⚠ SE CAUTA NUMAI NUME DIN TAXONOMIE. Orice alt cuvant intre accente grave
        (`value`, `currency`, `sessionStorage`) n-are ce cauta in socoteala: nota
        vorbeste despre campuri, nu despre alt eveniment.
      */
      const pomenite = new Set(
        [...nota.matchAll(/`([a-z_]+)`/g)].map((x) => x[1]).filter((x) => NUME.has(x)),
      );
      if (pomenite.size === 0) continue;
      if (pomenite.has(nume)) continue;

      vinovate.push(
        `${f}: nota de deasupra lui \`${nume}\` vorbeste doar despre ` +
        `${[...pomenite].map((x) => `\`${x}\``).join(", ")}`,
      );
    }
  }

  assert.deepEqual(
    vinovate, [],
    "note care descriu alt eveniment decat cel trimis de sub ele:\n  " + vinovate.join("\n  "),
  );
});

test("⚠ si proba CHIAR vede cazul pentru care a fost scrisa", () => {
  /*
    ⚠ MARTORUL. Regula de mai sus e usor de scris asa incat sa nu cada niciodata —
    de pilda daca `notaDeDeasupra` intoarce mereu `null`. Randurile astea o pun in
    fata defectului adevarat, reconstruit: chiar forma care a stat o zi in pagina
    de planuri.
  */
  const stricat = [
    '      /*',
    '        Nota asta vorbeste despre `purchase` si despre nimic altceva.',
    '      */',
    '      urmareste({',
    '        name: "begin_checkout",',
    '        plan_id: selectedPlan,',
    '      });',
  ].join("\n");

  const m = /urmareste\(\{\s*\r?\n?\s*name:\s*"([a-z_]+)"/.exec(stricat);
  assert.ok(m, "tiparul nu mai gaseste un eveniment scris pe mai multe randuri");

  const nota = notaDeDeasupra(stricat, m.index);
  assert.ok(nota, "nota lipita deasupra nu mai e gasita — regula ar tacea peste tot");

  const pomenite = [...nota.matchAll(/`([a-z_]+)`/g)].map((x) => x[1]).filter((x) => NUME.has(x));
  assert.deepEqual(pomenite, ["purchase"], "numele din nota nu mai e cules");
  assert.ok(!pomenite.includes(m[1]), "martorul nu mai reprezinta defectul");
});

test("⚠ o nota care pomeneste SI trecutul, SI evenimentul ei, trece", () => {
  /*
    ⚠ CE APARA. Fara randurile astea, cea mai simpla cale de a face proba sa taca ar
    fi sa se stearga din note orice pomenire a evenimentelor scoase — adica exact
    istoricul pentru care sunt scrise. Regula cere prezenta, nu exclusivitate.
  */
  const bun = [
    '      /*',
    '        Pana pe 03.09.2026 aici pleca alt eveniment. Acum pleaca',
    '        `begin_checkout`, la apasarea catre plata.',
    '      */',
    '      urmareste({ name: "begin_checkout", plan_id: selectedPlan });',
  ].join("\n");

  const m = /urmareste\(\{\s*\r?\n?\s*name:\s*"([a-z_]+)"/.exec(bun)!;
  const nota = notaDeDeasupra(bun, m.index)!;
  const pomenite = [...nota.matchAll(/`([a-z_]+)`/g)].map((x) => x[1]).filter((x) => NUME.has(x));
  assert.ok(pomenite.includes("begin_checkout"), "o nota corecta ar fi fost raportata ca vinovata");
});
