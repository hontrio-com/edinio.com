import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildVariantPrices, TARI_EURO } from "./mapping";
import type { AboutYouConfig } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   ACELASI NUMAR PLECA LA FIECARE TARA, ORICARE I-AR FI MONEDA (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Pretul se socoteste in EURO, si atat: `countries.map` il punea ca atare in fiecare tara aleasa.
   Cu Polonia in lista, 20 EUR pleca drept `retail_price: 20` — iar acolo cifra se citeste in
   ZLOTI. Aproape un sfert din pret, la fiecare vanzare, tacut.

   ⚠ EXISTA O PAZA LA CONFIGURARE, DAR CADEA DESCHIS. `tariNeEuro` intorcea lista goala cand
   nomenclatorul lor nu se putea citi — „fara nomenclator nu inventam un blocaj". Suna prudent si
   nu e: o paza care se stinge singura la o pana nu e o paza. Iar la TRIMITERE nu era nicio
   verificare, deci o configurare salvata intr-o clipa proasta ramanea gresita pentru totdeauna.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const config = (tari: string[]): AboutYouConfig => ({
  price_mode: "manual_eur",
  ship_countries: tari,
} as AboutYouConfig);

const varianta = { sku: "ABC-1", retail_price_eur: 20, sale_price_eur: null } as never;
const produs = { price: 100, compare_at_price: null } as never;

test("⚠ o tara din afara zonei euro OPRESTE trimiterea", () => {
  /* Nu se converteste: o conversie ar cere un curs pe fiecare moneda, o data de referinta si o
     hotarare despre rotunjire — trei lucruri pe care nu le luam in locul comerciantului. */
  for (const tara of ["PL", "CZ", "SE", "DK", "HU", "RO", "BG", "CH", "NO", "GB"]) {
    const r = buildVariantPrices(config(["DE", tara]), produs, varianta);
    assert.ok("error" in r, `${tara} ar fi trebuit sa opreasca`);
    assert.match((r as { error: string }).error, new RegExp(tara));
  }
});

test("⚠ si tarile din zona euro trec", () => {
  const r = buildVariantPrices(config(["DE", "AT", "FR"]), produs, varianta);
  assert.ok(!("error" in r), `nu trebuia sa opreasca: ${JSON.stringify(r)}`);
  assert.equal((r as { prices: unknown[] }).prices.length, 3);
});

test("⚠ codul de tara se compara fara sa conteze scrierea", () => {
  /* Configurarea poate purta „de" scris cu litere mici; comparat brut, ar fi fost oprit degeaba. */
  const r = buildVariantPrices(config(["de", "at"]), produs, varianta);
  assert.ok(!("error" in r));
});

test("⚠ lista e a ZONEI EURO, nu a oricui foloseste euro", () => {
  /*
   * Statele care folosesc euro fara sa fie in zona (Monaco, Muntenegru, Kosovo…) nu sunt piete
   * About You, iar o lista mai larga inseamna mai multe feluri de a gresi. Ce lipseste se
   * opreste — si asta e directia buna.
   */
  assert.equal(TARI_EURO.size, 20);
  for (const t of ["DE", "FR", "IT", "ES", "HR"]) assert.ok(TARI_EURO.has(t), t);
  for (const t of ["ME", "XK", "MC", "AD", "SM"]) assert.ok(!TARI_EURO.has(t), t);
});

test("⚠ si paza de la configurare nu mai cade deschis", () => {
  /*
   * Doua cai cadeau deschis: nomenclatorul necitibil (`return []`) si tara pe care nomenclatorul
   * lor n-o cunoaste (`m == null` insemna „treci"). Amandoua cad acum pe lista noastra.
   */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  assert.doesNotMatch(act, /if \(!r\.ok\) return \[\];/);
  assert.match(act, /return coduri\.filter\(\(c\) => !TARI_EURO\.has\(c\.toUpperCase\(\)\)\);/);
  assert.match(act, /if \(m == null\) return !TARI_EURO\.has\(c\.toUpperCase\(\)\);/);
});
