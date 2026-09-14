import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  campuriDeCurier,
  curierulEDeclaratDeMagazin,
  tipDeLivrareCunoscut,
  type ZoneleMagazinului,
} from "@/lib/shipping/curierul-declarat";

/* ══════════════════════════════════════════════════════════════════════════
   CURIERUL SCRIS PE COMANDA TREBUIE SA FIE UNUL AL MAGAZINULUI (14.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   `selected_courier`, `courier_label` si `delivery_type` veneau din browser si se scriau pe
   comanda fara nicio verificare. Semnatura cotatiei le acopera, dar `autoritativeShipping`
   intoarce doar un NUMAR, deci nu spune niciodata apelantului ca optiunea pretinsa n-a fost
   verificata: pe livrarea gratuita (`esteGratuit` taie scurt) si pe caderea pe tariful
   implicit, campurile ajungeau pe comanda oricum.

   Masurat pe 14.09.2026, pe cele 254 de comenzi care poarta un curier: ZERO au o cheie care
   nu exista in `shipping_zones`, deci regula nu ia curierul niciunei comenzi reale. Doua
   comenzi `own` stau insa pe o zona care azi nu mai e pornita, si de aceea se cere sa existe
   cheia, NU sa fie si pornita.
*/

const COMANDA = "src/lib/actions/order.actions.ts";
const COTARE = "src/lib/actions/shipping.actions.ts";
const fisier = (p: string) => readFileSync(p, "utf8");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const ZONE = { woot: { enabled: true, price: 20 }, own: { enabled: false, price: 10 } };

/* ── Regula ───────────────────────────────────────────────────────────────── */

test("un curier declarat de magazin trece; unul fabricat, nu", () => {
  assert.equal(curierulEDeclaratDeMagazin("woot", ZONE), true);
  assert.equal(curierulEDeclaratDeMagazin("cargus", ZONE), false, "magazinul n-are Cargus");
});

test("⚠ ZONA OPRITA NU TAIE COMANDA, si asta e anume", () => {
  /*
   * ⚠ JUMATATEA CARE FACE REGULA SIGURA. Doua comenzi `own` reale stau azi pe o zona
   * nepornita: chiar cursa dintre checkout si setarile comerciantului, care inchide o zona cat
   * timp un cumparator e in finalizare. Ceruta si pornirea, regula ar fi taiat acolo o vanzare
   * cinstita, ca sa inchida o fabricare care nu s-a intamplat niciodata.
   *
   * Aceeasi judecata ca in `autoritativeShipping`: o cotatie pierduta nu are voie sa coste o
   * vanzare.
   */
  assert.equal(curierulEDeclaratDeMagazin("own", ZONE), true);
  assert.equal(ZONE.own.enabled, false, "zona chiar e oprita in mostra");
});

test("⚠⚠ CHEILE DE PE LANTUL DE PROTOTIPURI NU SUNT CURIERI", () => {
  /*
   * `zone["constructor"]` nu e `undefined`: vine de pe `Object.prototype`. O verificare scrisa
   * ca `zone[curier] !== undefined` ar fi raspuns „da" tocmai pentru sirurile alese anume, adica
   * exact pentru cine cauta o portita.
   */
  for (const cheie of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    assert.equal(curierulEDeclaratDeMagazin(cheie, ZONE), false, `„${cheie}” a trecut ca un curier`);
  }
});

test("⚠ forma de ARRAY a zonelor nu declara niciun curier", () => {
  /* `shipping_zones` are doua forme in productie: obiect la 19 magazine, array gol la 110. */
  assert.equal(curierulEDeclaratDeMagazin("woot", [] as unknown as ZoneleMagazinului), false);
  assert.equal(curierulEDeclaratDeMagazin("woot", null), false);
  assert.equal(curierulEDeclaratDeMagazin("woot", undefined), false);

  /*
   * ⚠ SI UN ARRAY CARE POARTA CHIAR CHEIA, altfel paza nu e probata deloc.
   *
   * Prima forma a probei incerca doar cu arrayul GOL, si acela n-are cheia `woot` nici cu paza
   * pe `Array.isArray`, nici fara ea: mutantul care scotea paza TRECEA nevazut. Un array poate
   * primi insa o insusire cu nume, si atunci `hasOwnProperty` raspunde „da”.
   */
  const arrayCuCheie: Record<string, { enabled?: boolean; price?: number }> =
    [] as unknown as Record<string, { enabled?: boolean; price?: number }>;
  arrayCuCheie.woot = { enabled: true, price: 20 };
  assert.equal(Object.prototype.hasOwnProperty.call(arrayCuCheie, "woot"), true, "mostra chiar poarta cheia");
  assert.equal(curierulEDeclaratDeMagazin("woot", arrayCuCheie), false);
});

test("un curier care nu e text, sau e gol, nu trece", () => {
  assert.equal(curierulEDeclaratDeMagazin("", ZONE), false);
  assert.equal(curierulEDeclaratDeMagazin("   ", ZONE), false);
  assert.equal(curierulEDeclaratDeMagazin(42, ZONE), false);
  assert.equal(curierulEDeclaratDeMagazin(null, ZONE), false);
});

test("tipul de livrare e unul din cele doua produse de noi", () => {
  assert.equal(tipDeLivrareCunoscut("address"), true);
  assert.equal(tipDeLivrareCunoscut("locker"), true);
  assert.equal(tipDeLivrareCunoscut("gratis"), false);
  assert.equal(tipDeLivrareCunoscut(""), false);
  assert.equal(tipDeLivrareCunoscut(undefined), false);
});

/* ── Ce ajunge pe comanda ─────────────────────────────────────────────────── */

test("un curier adevarat isi duce eticheta si tipul cu el", () => {
  assert.deepEqual(
    campuriDeCurier("woot", "Livrare prin Woot", "address", ZONE, true),
    { courier: "woot", courier_label: "Livrare prin Woot", delivery_type: "address" },
  );
});

test("⚠ un curier fabricat nu scrie NIMIC, nici eticheta", () => {
  /*
   * Eticheta pleaca odata cu curierul sau deloc. Altfel „Livrare prin Cargus" ar fi ajuns pe
   * factura si in emailul cumparatorului fara niciun curier sub ea.
   */
  assert.deepEqual(campuriDeCurier("cargus", "Livrare prin Cargus", "address", ZONE, true), {});
  assert.deepEqual(campuriDeCurier("__proto__", "orice", "address", ZONE, true), {});
});

test("⚠ un tip de livrare inventat se arunca, dar comanda ramane buna", () => {
  /* Un curier adevarat cu un camp de aruncat nu e o comanda de refuzat. */
  assert.deepEqual(
    campuriDeCurier("woot", "Livrare prin Woot", "teleportare", ZONE, true),
    { courier: "woot", courier_label: "Livrare prin Woot" },
  );
});

test("o eticheta goala nu se scrie", () => {
  assert.deepEqual(campuriDeCurier("woot", "   ", "locker", ZONE, true), { courier: "woot", delivery_type: "locker" });
});

/* ── Comutatorul de livrare ───────────────────────────────────────────────── */

test("⚠⚠ LIVRAREA STINSA NU SCRIE NICIUN CURIER, nici pe unul adevarat", () => {
  /*
   * Hotararea proprietarului (14.09.2026): „stins" inseamna chiar ce promite eticheta de pe ecran.
   *
   * Cotarea intoarce lista goala, deci un cumparator cinstit n-are ce alege. Regula asta inchide
   * cealalta usa: cine trimite oricum un curier in cerere nu-l mai scrie pe comanda.
   */
  assert.deepEqual(campuriDeCurier("woot", "Livrare prin Woot", "address", ZONE, false), {});
});

test("⚠ si orice altceva decat `true` inseamna stins", () => {
  /*
   * `updateShippingConfig` e „use server": tipul ei nu exista la rulare, deci in campul asta poate
   * ajunge orice printr-o chemare HTTP directa. Paza e `!== true`, nu „daca e fals".
   */
  for (const valoare of [undefined, null, 0, "", "true", 1]) {
    assert.deepEqual(
      campuriDeCurier("woot", "Livrare prin Woot", "address", ZONE, valoare as unknown as boolean),
      {},
      `„${String(valoare)}" a trecut drept livrare pornita`,
    );
  }
});

/* ── Cusatura: AMANDOUA checkout-urile ────────────────────────────────────── */

test("⚠⚠ REGULA E IN AMANDOUA CHECKOUT-URILE, nu doar in cel gasit primul", () => {
  /*
   * ⚠ PROBA ASTA E CHIAR CAPCANA CASEI. Sunt doua checkout-uri (comanda directa si cea din
   * cos), cu blocuri de scriere identice caracter cu caracter. O reparatie pusa intr-unul
   * singur trece de `tsc`, trece de suita, si lasa jumatate din trafic neatins.
   *
   * Se NUMARA aparitiile, cu pragul masurat: exact doua.
   */
  const cod = faraComentarii(fisier(COMANDA));
  const apeluri = cod.match(/\.\.\.campuriDeCurier\(/g) ?? [];
  assert.equal(apeluri.length, 2, `regula e in ${apeluri.length} checkout-uri; trebuie in doua`);

  /*
   * ⚠ Si niciunul nu mai SCRIE curierul de-a dreptul din browser.
   *
   * ⚠ SE TINTESTE TIPARUL DE SCRIERE, nu orice aparitie a campului. Prima forma a probei cerea
   * `doesNotMatch(/courier: data\.selected_courier,/)` si cadea pe cod BUN: acelasi camp e si
   * argumentul `optiune` dat lui `autoritativeShipping` (`:1442` si `:4262`), adica tocmai
   * optiunea pretinsa pe care semnatura trebuie s-o confrunte. Interzisa acolo, verificarea
   * cotatiei n-ar mai fi avut ce compara.
   */
  assert.doesNotMatch(
    cod,
    /\.\.\.\(data\.selected_courier && \{/,
    "un checkout inca scrie curierul neverificat",
  );
});

test("⚠⚠ SI CHIAR PRIMESC COMUTATORUL, pe amandoua drumurile", () => {
  /*
   * Fara randul asta in checkout, paza din `campuriDeCurier` ar exista si n-ar fi chemata niciodata
   * cu valoarea adevarata.
   */
  const cod = faraComentarii(fisier(COMANDA));
  const cuSteag = cod.match(/cfgRow\?\.shipping_enabled === true,/g) ?? [];
  assert.equal(cuSteag.length, 2, `comutatorul ajunge la ${cuSteag.length} apeluri; trebuie la doua`);
});

test("⚠⚠ SI COLOANA CHIAR SE CERE DIN BAZA, altfel paza sterge curierul de pe TOATE comenzile", () => {
  /*
   * ═══ ⚠ CATASTROFA PE CARE O APARA AFIRMATIA ASTA ═══
   *
   * Paza citeste `cfgRow?.shipping_enabled === true`. Daca `select`-ul NU cere coloana, valoarea e
   * `undefined`, conditia e falsa, si atunci curierul, eticheta si tipul de livrare dispar de pe
   * FIECARE comanda, la toate magazinele. O reparatie care pare pusa si care sterge date reale pe
   * tot traficul, fara nicio eroare si fara nicio urma.
   *
   * ⚠ Si celalalt capat al aceleiasi capcane: o coloana ceruta dar inexistenta rupe TOATA
   * interogarea, nu doar campul, deci setarile magazinului nu s-ar mai citi deloc. Masurat inainte
   * de a o adauga: `shipping_enabled boolean default true not null` in baseline, expusa in vederea
   * publica, si tipata `boolean` in tipurile generate.
   */
  const cod = fisier(COMANDA);
  const cerute = cod.match(/shipping_zones, shipping_enabled"/g) ?? [];
  assert.equal(cerute.length, 2, `coloana se cere in ${cerute.length} interogari; trebuie in doua`);
});

test("⚠⚠ SI CEALALTA JUMATATE: cotarea nu mai OFERA nimic cand livrarea e stinsa", () => {
  /*
   * ═══ ⚠ REGULA ARE DOUA JUMATATI, SI PRIMA FORMA A PROBEI O ACOPEREA DOAR PE A DOUA ═══
   *
   * „Nu se SCRIE curierul" (mai sus) si „nu se OFERA curieri" (aici). Probata doar a doua,
   * cineva putea sterge poarta din cotare si niciun test n-ar fi cazut: comutatorul ar fi ramas
   * decorativ exact pe drumul pe care il vede cumparatorul, iar comerciantul ar fi citit pe ecran
   * ca livrarea e oprita in timp ce optiunile curgeau mai departe.
   *
   * ⚠ Si ordinea conteaza: poarta trebuie sa fie INAINTEA citirii zonelor. Pusa dupa, ar fi
   * ramas sub ea toata munca pe care tocmai o ocoleste.
   */
  const cod = faraComentarii(fisier(COTARE));

  assert.match(
    cod,
    /prices_include_vat, shipping_enabled"/,
    "cotarea nu mai cere coloana din baza, deci poarta ar citi `undefined`",
  );
  assert.match(
    cod,
    /if \(settings\.shipping_enabled !== true\) return \[\];/,
    "cotarea nu mai are poarta pe comutator",
  );

  const iPoarta = cod.indexOf("if (settings.shipping_enabled !== true) return [];");
  const iZone = cod.indexOf("const zones = (settings.shipping_zones");
  assert.ok(iPoarta > 0 && iZone > 0, "nu mai gasesc poarta sau citirea zonelor");
  assert.ok(iPoarta < iZone, "poarta pe comutator a ajuns DUPA citirea zonelor");
});

test("⚠ si chiar primesc zonele magazinului, nu `null`", () => {
  /*
   * Chemata cu `null`, regula ar raspunde „niciun curier nu e declarat" si ar goli campurile la
   * TOATE comenzile: o reparatie care pare pusa, dar care sterge date reale.
   */
  const cod = faraComentarii(fisier(COMANDA));
  const cuZone = cod.match(/\(cfgRow\?\.shipping_zones \?\? null\) as ZoneleMagazinului,/g) ?? [];
  assert.equal(cuZone.length, 2, `zonele ajung la ${cuZone.length} apeluri; trebuie la doua`);
});
