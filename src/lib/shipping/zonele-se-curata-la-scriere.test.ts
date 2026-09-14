import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseShippingZones } from "@/lib/shipping/rules";

/* ══════════════════════════════════════════════════════════════════════════
   ZONELE SE CURATA LA SCRIERE, CA SI CLASELE SI REGULILE (14.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   `updateShippingConfig` re-parsa clasele si regulile prin parserele partajate, „ca sa
   garanteze forma jsonb valida", dar ZONELE se scriau brut. Lipsea al treilea frate.

   ⚠ CE TRECEA PE ACOLO. `min="0"` din formular e doar o sugestie a navigatorului; serverul nu
   se uita deloc la pret. Iar in ecran casuta golita devine `parseFloat("") || 0`, deci un pret
   sters ca sa fie retastat se salveaza ca ZERO fara nicio vorba.

   ⚠ SI UNDE AJUNGE NUMARUL: din prima zona pornita se deduce `default_shipping_cost`, adica
   pretul pe care il vad toti cumparatorii pe pagina de produs, in cos, la finalizare, si pe
   care il citeste Google din datele structurate.

   ⚠ MASURAT INAINTE: din 25 de zone pornite, ZERO preturi negative, si niciun tarif implicit
   nul sau lipsa (toate intre 10 si 45 de lei). Curatarea nu misca nicio valoare din productie;
   e pusa inainte sa fie nevoie.
*/

const STORE = "src/lib/actions/store.actions.ts";
const fisier = (p: string) => readFileSync(p, "utf8");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ── Regula ───────────────────────────────────────────────────────────────── */

test("o zona buna trece neatinsa", () => {
  assert.deepEqual(
    parseShippingZones({ woot: { enabled: true, price: 20 } }),
    { woot: { enabled: true, price: 20 } },
  );
});

test("⚠ pretul nu poate fi negativ si nici altceva decat numar", () => {
  /* ⚠ Un pret negativ nu se poate incasa in niciun fel, deci se plafoneaza la 0, exact cum
     face `parseAction` pentru sumele regulilor. */
  assert.equal(parseShippingZones({ a: { enabled: true, price: -5 } }).a.price, 0);
  assert.equal(parseShippingZones({ a: { enabled: true, price: "abc" } }).a.price, 0);
  assert.equal(parseShippingZones({ a: { enabled: true, price: Number.NaN } }).a.price, 0);
  /* ⚠ `17,50` cu virgula, cum se scrie la noi, NU e numar pentru `Number()`. */
  assert.equal(parseShippingZones({ a: { enabled: true, price: "17,50" } }).a.price, 0);
  assert.equal(parseShippingZones({ a: { enabled: true, price: undefined } }).a.price, 0);
});

test("pretul se rotunjeste la doi bani", () => {
  assert.equal(parseShippingZones({ a: { enabled: true, price: 17.456 } }).a.price, 17.46);
});

test("⚠ `enabled` e STRICT boolean", () => {
  /* Sirul „false" e adevarat in JavaScript: un curier stins ar fi reaparut in checkout. */
  assert.equal(parseShippingZones({ a: { enabled: "false", price: 1 } }).a.enabled, false);
  assert.equal(parseShippingZones({ a: { enabled: 1, price: 1 } }).a.enabled, false);
  assert.equal(parseShippingZones({ a: { enabled: true, price: 1 } }).a.enabled, true);
});

test("⚠ FORMA DE ARRAY nu declara nicio zona", () => {
  /* `shipping_zones` are doua forme in productie: obiect la 19 magazine, array gol la 110.
     `typeof [] === "object"`, deci fara paza un array ar fi produs chei numerice. */
  assert.deepEqual(parseShippingZones([]), {});
  assert.deepEqual(parseShippingZones([{ enabled: true, price: 5 }]), {});
  assert.deepEqual(parseShippingZones(null), {});
  assert.deepEqual(parseShippingZones(undefined), {});
  assert.deepEqual(parseShippingZones("woot"), {});
});

test("⚠⚠ o cheie de pe lantul de prototipuri nu devine curier", () => {
  /*
   * ⚠ SE CONSTRUIESTE CU `JSON.parse`, nu cu un literal: intr-un literal, `__proto__` schimba
   * prototipul in loc sa creeze o insusire. Iar `JSON.parse` e chiar drumul pe care soseste
   * configuratia din corpul cererii, deci mostra e cea adevarata.
   */
  const dinCerere = JSON.parse('{"__proto__": {"enabled": true, "price": 5}, "woot": {"enabled": true, "price": 20}}');
  const iesire = parseShippingZones(dinCerere);

  /* Zona buna trece; cea otravita nu apare. */
  assert.deepEqual(iesire, { woot: { enabled: true, price: 20 } });

  /*
   * ⚠⚠ SI PROTOTIPUL RAMANE INTACT, care e chiar pericolul.
   *
   * Prima forma a probei cerea doar `deepEqual(…, {})`, si TRECEA chiar fara nicio paza: o
   * atribuire `iesire["__proto__"] = …` nu creeaza o cheie (deci egalitatea cu `{}` tinea), ci
   * SCHIMBA prototipul. Adica proba era verde tocmai in clipa in care obiectul era otravit.
   * Verificat cu o sonda: `Object.entries` intoarce cheia, iar `hasOwnProperty` raspunde `true`.
   *
   * Aici se cere lucrul care conteaza: obiectul intors n-a capatat un prototip din afara.
   */
  assert.equal(
    Object.getPrototypeOf(iesire),
    Object.prototype,
    "prototipul obiectului intors a fost schimbat din afara: `zone[\"orice\"]?.enabled` ar raspunde „da”",
  );
  assert.equal((iesire as Record<string, unknown>).curierInexistent, undefined,
    "o cheie inexistenta mosteneste o zona: prototipul e otravit");
});

test("⚠ `auto_price` lipsa RAMANE lipsa, fiindca implicitul e ADEVARAT", () => {
  /* Cotarea citeste `zone.auto_price !== false`. Scris `undefined` sau `false` din senin, un
     curier care coteaza live ar fi trecut tacut pe tarif fix. */
  const fara = parseShippingZones({ a: { enabled: true, price: 1 } }).a;
  assert.equal("auto_price" in fara, false);
  assert.equal(parseShippingZones({ a: { enabled: true, price: 1, auto_price: false } }).a.auto_price, false);
  assert.equal(parseShippingZones({ a: { enabled: true, price: 1, auto_price: true } }).a.auto_price, true);
  /* Un sir nu e boolean: se lasa lipsa, adica implicitul adevarat. */
  assert.equal("auto_price" in parseShippingZones({ a: { enabled: true, price: 1, auto_price: "false" } }).a, false);
});

test("eticheta goala nu se scrie", () => {
  assert.equal("label" in parseShippingZones({ a: { enabled: true, price: 1, label: "   " } }).a, false);
  assert.equal(parseShippingZones({ a: { enabled: true, price: 1, label: " Livrare rapida " } }).a.label, "Livrare rapida");
});

test("⚠ NU se stinge un curier din cauza pretului, si asta e anume", () => {
  /*
   * A stinge singur un curier pe baza pretului ar fi o hotarare de produs, nu o curatare: omul
   * ar deschide panoul si l-ar gasi oprit fara sa fi cerut asta. Parserul face forma sigura,
   * atat.
   */
  assert.equal(parseShippingZones({ a: { enabled: true, price: -9 } }).a.enabled, true);
});

/* ── Cusatura: parserul chiar e folosit, si INAINTEA socotelii ────────────── */

test("⚠⚠ `default_shipping_cost` se socoteste din zonele CURATATE, nu din cele brute", () => {
  /*
   * ⚠ AICI E CHIAR DEFECTUL. Un parser pus langa o socoteala care citeste tot datele brute e
   * decor: `NaN` sau negativul ar fi ajuns mai departe in pretul public, cu parserul alaturi.
   */
  const cod = faraComentarii(fisier(STORE));
  assert.match(cod, /const zonesRow = parseShippingZones\(config\.shipping_zones\);/,
    "zonele nu se mai curata la scriere");
  assert.match(cod, /const enabledZone = Object\.values\(zonesRow\)\.find\(/,
    "tariful implicit se socoteste iar din zonele brute");
  assert.doesNotMatch(cod, /Object\.values\(config\.shipping_zones\)/,
    "a ramas o socoteala pe zonele brute");
});

test("⚠⚠ AMANDOUA ramurile de scriere folosesc zonele curatate", () => {
  /*
   * ⚠ CAPCANA CASEI: `update` si `insert`. Pusa doar in prima, magazinele care inca n-au rand
   * de setari, adica exact cele NOI, ar fi ocolit curatarea. Se NUMARA, nu se cauta.
   */
  const cod = faraComentarii(fisier(STORE));
  const curatate = (cod.match(/shipping_zones: zonesRow as never,/g) ?? []).length;
  assert.equal(curatate, 2, `zonele curatate se scriu in ${curatate} din 2 ramuri`);
  assert.doesNotMatch(cod, /shipping_zones: config\.shipping_zones/,
    "o ramura inca scrie zonele brut");
});

test("⚠ si clasele si regulile isi pastreaza parserele: n-am mutat problema", () => {
  const cod = faraComentarii(fisier(STORE));
  assert.match(cod, /parseShippingClasses\(config\.shipping_classes \?\? \[\]\)/);
  assert.match(cod, /parseShippingRules\(config\.shipping_rules \?\? \[\]\)/);
});
