import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * FIECARE SCRIERE DE URMARIRE POARTA MAGAZINUL                  (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ `business_id` NU E UN FILTRU DE PRISOS PE DRUMURILE ASTEA, E AUTORIZARE.
 *
 * Cronurile de urmarire scriu cu rol de SERVICIU, deci RLS nu le opreste nimic. Randul care
 * margineste scrierea la magazinul comenzii e singurul lucru care sta intre un `id` gresit si
 * randul altui comerciant. Cronul Pall-Ex are chiar propozitia asta scrisa deasupra lui.
 *
 * Masurat pe 14.09.2026: din treisprezece cronuri de urmarire, DOISPREZECE il aveau. Cronul Sameday
 * scria `.eq("id", o.id)` si atat, cu incarcatura turnata `as never`, adica nici `tsc` nu se uita
 * la ce se scrie acolo.
 *
 * ⚠ SI DE CE E O PROBA CARE ENUMERA, nu una scrisa pe fisierul reparat. Reparat doar Sameday, o
 * proba pe el ar fi ramas verde la nesfarsit in timp ce urmatorul cron adaugat ar fi nascut aceeasi
 * gaura. Aceeasi forma ca `poarta-awb.test.ts`, care cere ca FIECARE actiune de emitere sa cheme
 * poarta.
 */

const RADACINA = "src/app/api/cron";

/** Toate rutele de urmarire, gasite pe disc, nu scrise de mana intr-o lista. */
function ruteDeUrmarire(): string[] {
  return readdirSync(RADACINA, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith("-tracking"))
    .map((d) => `${RADACINA}/${d.name}/route.ts`);
}

const faraComentarii = (cale: string) =>
  readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ lista de rute nu se poate goli in tacere", () => {
  /*
   * Fara afirmatia asta, o redenumire de dosar ar face lista goala, bucla de mai jos n-ar rula
   * niciodata, si proba ar trece raportand ca pazeste ceva. O proba care nu poate cadea singura nu
   * e o proba.
   */
  const rute = ruteDeUrmarire();
  assert.ok(rute.length >= 13, `am gasit doar ${rute.length} cronuri de urmarire, nu toate`);
});

test("⚠⚠ FIECARE scriere in `orders` dintr-un cron de urmarire poarta `business_id`", () => {
  /*
   * ⚠ FELIA SE TAIE PE LANT, nu pe fisier. Cautat pe tot fisierul, `business_id` s-ar fi gasit in
   * `select` sau intr-o alta interogare, iar afirmatia ar fi trecut peste o scriere descoperita.
   * Se ia deci de la fiecare `from("orders")` pana la `;`, adica exact lantul acelei instructiuni.
   */
  const vinovate: string[] = [];
  for (const cale of ruteDeUrmarire()) {
    const s = faraComentarii(cale);
    let de = s.indexOf('from("orders")');
    while (de !== -1) {
      const capat = s.indexOf(";", de);
      const lant = s.slice(de, capat === -1 ? s.length : capat);
      if (lant.includes(".update(") && !lant.includes("business_id")) {
        vinovate.push(`${cale} :: ${lant.replace(/\s+/g, " ").slice(0, 110)}`);
      }
      de = s.indexOf('from("orders")', de + 1);
    }
  }
  assert.deepEqual(vinovate, [], `scrieri de urmarire fara autorizare pe magazin:\n${vinovate.join("\n")}`);
});

test("⚠ si cronul Sameday, cel care a lipsit, o poarta pe drumul lui", () => {
  /*
   * Afirmatia de mai sus cade si daca dispare ruta cu totul. Asta o numeste, ca reparatia sa aiba
   * un martor cu numele ei: scrierea din `marcheazaVerificat` era singura de pe platforma fara
   * niciun magazin in ea.
   */
  const s = faraComentarii(`${RADACINA}/sameday-tracking/route.ts`);
  assert.match(s, /\.eq\("id", o\.id\)\.eq\("business_id", o\.business_id\)/,
    "scrierea de urmarire Sameday a ramas iar fara magazin");
});
