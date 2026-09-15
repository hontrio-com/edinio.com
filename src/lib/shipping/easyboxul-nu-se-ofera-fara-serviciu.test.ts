import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * EASYBOX-UL SAMEDAY NU SE OFERA CUMPARATORULUI DACA CONTUL NU-L ARE.
 *
 * ═══ ⚠ CE S-A INCHIS (15.09.2026) ═══
 *
 * Ramura Sameday din `getShippingOptions` punea in lista DOUA optiuni neconditionat: una
 * la adresa si una in easybox. Daca cotarea la easybox pica, se cadea pe tariful fix al
 * zonei, deci optiunea ramanea acolo oricum.
 *
 * Dar serviciul de dulap se cere la Sameday, pe contract, si nu orice cont il are. Un cont
 * fara el vedea totusi „Sameday EasyBox (locker)" in checkout: cumparatorul alegea, platea,
 * si abia la fereastra de AWB comerciantul afla ca nu se poate. De azi emiterea chiar
 * REFUZA in cazul asta (`easybox-fara-serviciu.test.ts`), deci lista n-are voie sa promita
 * ceva ce emiterea refuza.
 *
 * ═══ ⚠ DE CE PROBA CITESTE SURSA ═══
 *
 * Regula e o CABLARE, nu o functie: „optiunea de easybox atarna de existenta serviciului".
 * Ramura nu se poate rula fara sesiune, baza si furnizor. Mutantul se pune pe COD: scotand
 * conditia din lant, probele de mai jos cad.
 *
 * ⚠ Si a doua parte a regulii, la fel de importanta: verificarea sta IN lant, nu inaintea
 * lui. Un `await` in bucla ar fi intarziat cotarea TUTUROR curierilor cu un drum dus-intors
 * la Sameday.
 */

const RAD = process.cwd();
const SURSA = readFileSync(path.join(RAD, "src/lib/actions/shipping.actions.ts"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

/** Ramura Sameday din `getShippingOptions`, taiata pe acolade potrivite. */
function ramuraSameday(): string {
  const start = SURSA.indexOf('if (courierId === "sameday") {');
  assert.notEqual(start, -1, "nu s-a gasit ramura Sameday din getShippingOptions");
  const prima = SURSA.indexOf("{", start);
  let adancime = 0;
  for (let i = prima; i < SURSA.length; i++) {
    if (SURSA[i] === "{") adancime++;
    else if (SURSA[i] === "}") {
      adancime--;
      if (adancime === 0) return SURSA.slice(prima, i + 1);
    }
  }
  assert.fail("acoladele ramurii Sameday nu se inchid");
}

test("⚠ ramura chiar se gaseste si chiar are continut", () => {
  /* Fara asta, o redenumire ar face feliile goale si toate afirmatiile ar trece pe nimic. */
  const r = ramuraSameday();
  assert.ok(r.length > 600, `ramura Sameday are doar ${r.length} caractere`);
  assert.ok(r.includes("estimateSamedayCost"), "ramura trebuie sa coteze prin Sameday");
});

test("optiunea de easybox atarna de serviciul de dulap al contului", () => {
  const r = ramuraSameday();
  assert.ok(
    r.includes("getSamedayLockerServiceId(samedayConfig!)"),
    "ramura trebuie sa intrebe daca contul are serviciu de dulap",
  );
  assert.ok(
    r.includes("if (idEasybox === null) return undefined;"),
    "fara serviciu de dulap nu se pune NICIO optiune de easybox, nici macar tariful fix",
  );
});

test("⚠ verificarea nu intarzie ceilalti curieri: sta IN lant, nu inaintea lui", () => {
  const r = ramuraSameday();
  /*
   * `await getSamedayLockerServiceId(...)` scris drept in corpul buclei ar fi serializat
   * cotarea. Forma buna e `.then(...)` pusa in `promises`.
   */
  assert.ok(
    !/await\s+getSamedayLockerServiceId/.test(r),
    "verificarea nu are voie sa fie asteptata in bucla: intarzie TOTI curierii",
  );
  assert.ok(
    /getSamedayLockerServiceId\(samedayConfig!\)\s*\n?\s*\.catch\(\(\) => null\)\s*\n?\s*\.then\(/.test(r),
    "verificarea trebuie sa fie un lant pus in `promises`",
  );
});

test("livrarea la adresa ramane neconditionata: ea nu are nevoie de niciun dulap", () => {
  const r = ramuraSameday();
  /*
   * ⚠ Plasa care apara reparatia de exces. Legand DIN GRESEALA si livrarea la adresa de
   * serviciul de dulap, un cont fara easybox ar fi ramas fara nicio optiune Sameday, iar
   * pe un magazin cu Sameday ca singura zona sectiunea de livrare ar fi DISPARUT. Exact
   * lectia platita la FAN.
   */
  const laAdresa = r.indexOf('deliveryType: "address"');
  const verificarea = r.indexOf("getSamedayLockerServiceId");
  assert.notEqual(laAdresa, -1);
  assert.notEqual(verificarea, -1);
  assert.ok(
    laAdresa < verificarea,
    "optiunea la adresa trebuie pusa INAINTE de orice verificare de dulap",
  );
});
