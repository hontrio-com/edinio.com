import assert from "node:assert/strict";
import { test } from "node:test";
import { amprentaCombinatie, desfaIdArticol, idArticol } from "./identitate";

const P = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ALT = "7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";

/*
 * ⚠ CE APARA PROBELE DE AICI: `<Id>` e singura legatura dintre ce am trimis noi si ce
 * ne trimite Pepita inapoi la o comanda. Daca se schimba, ei fac produs nou; daca doua
 * articole ajung la acelasi, unul il suprascrie pe celalalt; daca nu se poate desface,
 * comanda nu se leaga de niciun produs si stocul nu scade.
 */

test("produsul simplu pleaca cu chiar id-ul lui din baza", () => {
  assert.equal(idArticol(P, null), P);
});

test("⚠ amprenta NU se schimba intre rulari", () => {
  /*
   * Documentatia lor: „Nem változik (azaz ha a termék adatai változnak, készlet
   * változik, etc. ez az azonosító ugyanaz marad)". O amprenta care depinde de ceas,
   * de `Math.random` sau de ordinea in memorie ar face produs nou la fiecare feed.
   */
  assert.equal(amprentaCombinatie("S / Roșu"), amprentaCombinatie("S / Roșu"));
  assert.equal(idArticol(P, "S / Roșu"), idArticol(P, "S / Roșu"));
});

test("⚠ combinatii diferite dau amprente diferite, si diacriticele conteaza", () => {
  const vazute = new Set([
    amprentaCombinatie("S / Roșu"), amprentaCombinatie("M / Roșu"),
    amprentaCombinatie("S / Rosu"), amprentaCombinatie("S / Roşu"),
    amprentaCombinatie("S/Roșu"), amprentaCombinatie(""),
  ]);
  /*
   * ⚠ „Roșu" (virgulita, U+0219) si „Roşu" (sedila, U+015F) sunt doua siruri diferite
   * si trebuie sa ramana doua articole diferite: o amprenta care le-ar uni ar face ca
   * doua marimi sa se calce reciproc la ei.
   */
  assert.equal(vazute.size, 6);
});

test("amprenta are lungime fixa si numai cifre hexazecimale", () => {
  for (const t of ["S", "S / Roșu / Bumbac", "", "🎁 / XXL", "a".repeat(500)]) {
    assert.match(amprentaCombinatie(t), /^[0-9a-f]{16}$/, `pentru „${t}”`);
  }
});

test("id-ul se desface inapoi in produs si combinatie", () => {
  assert.deepEqual(desfaIdArticol(idArticol(P, null)), { productId: P, amprenta: null });
  assert.deepEqual(desfaIdArticol(idArticol(P, "S / Roșu")), {
    productId: P, amprenta: amprentaCombinatie("S / Roșu"),
  });
});

test("⚠ ce nu e un id de-al nostru NU se desface", () => {
  /*
   * Intors „ceva" pentru orice sir, potrivirea din ingest ar fi cautat in baza dupa
   * gunoi, iar in cel mai rau caz ar fi nimerit un produs. Se intoarce `null`, si
   * atunci linia ajunge in carantina, unde comerciantul o vede.
   */
  for (const rau of ["", "   ", "abc", "ozq123", "1234", null, undefined, 42, {},
                     `${P}--nuHex`, `${P}--0123`, "not-a-uuid--0123456789abcdef"]) {
    assert.equal(desfaIdArticol(rau), null, `pentru ${JSON.stringify(rau)}`);
  }
});

test("id-ul altui produs nu se confunda cu al nostru", () => {
  assert.notEqual(idArticol(P, "S"), idArticol(ALT, "S"));
  assert.equal(desfaIdArticol(idArticol(ALT, "S"))?.productId, ALT);
});

test("uuid-ul se citeste si cu majuscule, si iese cu litere mici", () => {
  assert.equal(desfaIdArticol(P.toUpperCase())?.productId, P);
});
