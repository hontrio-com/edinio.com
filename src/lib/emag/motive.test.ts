import { strict as assert } from "node:assert";
import { test } from "node:test";
import { eRespinsaDeEmag, motiveDeLaEi } from "./motive";

/*
 * ═══ 152 DE PRODUSE REFUZATE, ZERO MOTIVE ARATATE (audit 24.08.2026) ═══
 *
 * Masurat pe contul unui comerciant: 112 oferte cu documentatia respinsa, 34 blocate,
 * 6 cu EAN respins — si la TOATE 152, `doc_errors` gol.
 *
 * `doc_errors` era o presupunere de-a noastra: raspunsul lui `product_offer/read` NU e
 * in schema lor. Exact ca `ownership`, care s-a dovedit `boolean` acolo unde
 * documentatia scrie 1/2.
 *
 * Planul integrarii scrie chiar asta ca greseala de evitat (§12.9, lectia Trendyol):
 * motivul respingerii n-a fost aratat, iar produsele au stat „in aprobare" la
 * nesfarsit, cu comerciantul convins ca noi le tinem pe loc.
 */

test("eMAG motive: se culege din `doc_errors`, forma pe care o asteptam", () => {
  assert.deepEqual(motiveDeLaEi({ doc_errors: ["Lipseste marca", "EAN invalid"] }),
    ["Lipseste marca", "EAN invalid"]);
});

test("eMAG motive: se culege si din celelalte forme plauzibile", () => {
  /* ⚠ Nu se mai ghiceste O cheie. Cauza intregii probleme a fost ca am ales una
     singura si am crezut-o. */
  assert.deepEqual(motiveDeLaEi({ errors: [{ message: "Imagine inaccesibila" }] }),
    ["Imagine inaccesibila"]);
  assert.deepEqual(motiveDeLaEi({ validation_errors: "Categorie interzisa" }),
    ["Categorie interzisa"]);
  assert.deepEqual(motiveDeLaEi({ messages: [{ text: "Pret in afara benzii" }] }),
    ["Pret in afara benzii"]);
});

test("eMAG motive: dintr-un obiect se ia TEXTUL, nu tot obiectul", () => {
  /* ⚠ Luat intreg si serializat, motivul ar fi ajuns pe ecran ca
     `{"field":"ean","code":17}` — o forma cu care omul n-are ce face. */
  assert.deepEqual(
    motiveDeLaEi({ doc_errors: [{ field: "ean", code: 17, message: "EAN deja folosit" }] }),
    ["EAN deja folosit"],
  );
});

test("eMAG motive: acelasi motiv sub doua chei ramane unul singur", () => {
  assert.deepEqual(
    motiveDeLaEi({ doc_errors: ["Lipseste marca"], errors: ["Lipseste marca"] }),
    ["Lipseste marca"],
  );
});

test("eMAG motive: fara niciun motiv se intoarce lista goala, nu zgomot", () => {
  /* ⚠ Si asta E o informatie: o oferta respinsa fara motiv scris inseamna ca motivul e
     numai in panoul lor, iar ecranul trebuie sa spuna chiar asta. */
  for (const gol of [null, undefined, {}, "text", 7, { alta_cheie: "x" }]) {
    assert.deepEqual(motiveDeLaEi(gol), [], JSON.stringify(gol));
  }
});

test("eMAG motive: un motiv urias se taie, ca sa poata fi citit", () => {
  const r = motiveDeLaEi({ doc_errors: ["x".repeat(3000)] });
  assert.equal(r.length, 1);
  assert.ok(r[0].length <= 401, `${r[0].length} caractere`);
});

test("eMAG motive: care stari inseamna „respins”", () => {
  /* 5 marca · 6 EAN · 8 documentatie · 10 blocat · 12 actualizare respinsa */
  for (const s of [5, 6, 8, 10, 12]) assert.equal(eRespinsaDeEmag(s), true, `${s}`);
  /* 9 aprobat · 4 in validare · 1 in asteptare · 3 asteapta EAN · 11 actualizare */
  for (const s of [1, 3, 4, 9, 11, null, undefined]) {
    assert.equal(eRespinsaDeEmag(s), false, `${s}`);
  }
});
