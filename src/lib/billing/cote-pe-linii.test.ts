import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coteleLiniilor, motivCoteAmestecate } from "./cote-pe-linii";

/* ══════════════════════════════════════════════════════════════════════════
   O FACTURA CU O SINGURA COTA PE O COMANDA CU MAI MULTE
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Edinio a facturat dintotdeauna cu o singura cota, si pentru comenzile din magazin asta e
   adevarat prin constructie: cota e a magazinului. Marketplace-urile au schimbat premisa fara
   ca nimic sa spuna ceva: Pepita trimite TVA pe FIECARE linie, iar in Romania cotele chiar
   difera, hrana 11% si restul 21%.

   O factura fiscala gresita nu se retrage, se STORNEAZA. De-aia regula de aici nu aproximeaza.
*/

const linie = (pret: number, cant: number, cota: unknown) => ({ price: pret, quantity: cant, vat_rate: cota });

test("cote egale inseamna comanda uniforma", () => {
  const r = coteleLiniilor([linie(100, 2, 21), linie(50, 1, 21)]);
  assert.deepEqual(r.cote, [21]);
  assert.equal(r.uniforma, true);
  assert.equal(r.cotaDominanta, 21);
});

test("⚠ cote diferite NU sunt uniforme, si se vad amandoua", () => {
  const r = coteleLiniilor([linie(100, 1, 21), linie(30, 1, 11)]);
  assert.deepEqual(r.cote, [11, 21]);
  assert.equal(r.uniforma, false);
});

test("⚠ cand trebuie ales un singur numar, se alege dupa VALOARE, nu cel mai mare", () => {
  /*
   * `max(cote)` era ce faceam pana la auditul din 08.09.2026, si e cea mai proasta alegere:
   * supra-taxeaza TOATE liniile. Aici hrana de 900 de lei cu 11% tine greul, iar jucaria de 20
   * de lei cu 21% n-are de ce sa tarasca toata comanda dupa ea.
   */
  const r = coteleLiniilor([linie(900, 1, 11), linie(20, 1, 21)]);
  assert.equal(r.cotaDominanta, 11);
  assert.notEqual(r.cotaDominanta, Math.max(...r.cote), "nu e maximul");
});

test("cantitatea intra in valoare, nu doar pretul unitar", () => {
  /* Zece bucati de 30 de lei bat una de 100. */
  const r = coteleLiniilor([linie(100, 1, 21), linie(30, 10, 11)]);
  assert.equal(r.cotaDominanta, 11);
});

test("⚠ la valori egale castiga cota MAI MARE, nu prima intalnita", () => {
  /*
   * Ordinea liniilor intr-un `jsonb` nu e hotararea nimanui si se poate schimba la prima
   * rescriere a comenzii. Un rezultat care atarna de ea s-ar schimba singur. Iar dintre doua
   * rele, sub-taxarea aduce control fiscal, supra-taxarea nu.
   */
  assert.equal(coteleLiniilor([linie(100, 1, 11), linie(100, 1, 21)]).cotaDominanta, 21);
  assert.equal(coteleLiniilor([linie(100, 1, 21), linie(100, 1, 11)]).cotaDominanta, 21);
});

test("comanda fara nicio cota scrisa e uniforma si da zero", () => {
  /* Toate comenzile de dinaintea reparatiei, si cele din magazin. */
  for (const items of [[{ price: 10, quantity: 1 }], [], null, undefined, "nu e listă"]) {
    const r = coteleLiniilor(items);
    assert.equal(r.uniforma, true, JSON.stringify(items));
    assert.equal(r.cotaDominanta, 0);
  }
});

test("cotele stricate se sar, nu darama socoteala", () => {
  const r = coteleLiniilor([linie(100, 1, 21), linie(50, 1, "aiurea"), linie(50, 1, -5), linie(50, 1, null)]);
  assert.deepEqual(r.cote, [21], "raman doar cotele care chiar sunt cote");
  assert.equal(r.uniforma, true);
});

test("cota ZERO e o cota, nu o lipsa", () => {
  /* Un magazin neplatitor de TVA trimite 0, si asta chiar inseamna ceva. */
  const r = coteleLiniilor([linie(100, 1, 0), linie(50, 1, 21)]);
  assert.deepEqual(r.cote, [0, 21]);
  assert.equal(r.uniforma, false);
});

test("⚠ motivul spune ce cote sunt SI unde se face factura", () => {
  /* Un „nu se poate" fara urmatoarea miscare l-a pus deja pe comerciant sa apese de 208 ori
     un buton care n-avea cum sa mearga. */
  const m = motivCoteAmestecate([linie(100, 1, 21), linie(30, 1, 11)]);
  assert.ok(m);
  assert.match(m, /11%/);
  assert.match(m, /21%/);
  assert.match(m, /contul tău de facturare/);
  assert.equal(motivCoteAmestecate([linie(100, 1, 21)]), null, "cand e uniforma, nu se spune nimic");
});

/* ══════════════════════════════════════════════════════════════════════════
   POARTA DIN FACTURAREA AUTOMATA
   ══════════════════════════════════════════════════════════════════════════ */

const AUTO = readFileSync("src/lib/actions/invoice-auto.actions.ts", "utf8");

test("⚠ facturarea automata chiar CERE `items`, altfel poarta ar tacea", () => {
  /*
   * Ce nu se cere in `select` vine `undefined`, iar `coteleLiniilor` ar raspunde „uniforma"
   * pe o lista goala: poarta ar fi tacut exact pe comenzile pentru care exista. Aceeasi
   * lectie ca la coloanele de AWB din generarea in masa.
   */
  const i = AUTO.indexOf('.select("smartbill_invoice_number');
  assert.ok(i > 0, "nu s-a gasit citirea comenzii");
  const linia = AUTO.slice(i, AUTO.indexOf("\n", i));
  assert.match(linia, /\bitems\b/);
  assert.match(linia, /order_source/);
});

test("⚠ si opreste emiterea cand cotele difera", () => {
  const fara = AUTO.replace(/\/\*[\s\S]*?\*\//g, " ");
  const i = fara.indexOf("coteleLiniilor(o.items)");
  assert.ok(i > 0, "poarta trebuie sa cheme socoteala pe liniile comenzii");
  const bucata = fara.slice(i, i + 400);
  assert.match(bucata, /!cote\.uniforma/);
  assert.match(bucata, /return;/, "se opreste, nu doar se scrie in jurnal");
});
