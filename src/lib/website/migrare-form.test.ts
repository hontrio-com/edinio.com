import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MARIMI_CATALOG,
  MAX,
  PLATFORME_FORMULAR,
  verificaCerereMigrare,
} from "./migrare-form";

/*
 * Formularul de migrare e singurul loc de pe pagina `/migrare` prin care cineva
 * poate cere ceva. Daca verificarea respinge ceva ce nu trebuia, omul pleaca si
 * nu afla nimeni: nu exista nicio urma a unei cereri care n-a fost trimisa.
 *
 * De aia probele de mai jos apasa mai tare pe „ce trebuie SA TREACA" decat pe „ce
 * trebuie respins" — la fel ca la `contact-form.test.ts`.
 */

const BUNA = {
  nume: "Ion Popescu",
  email: "ion@exemplu.ro",
  telefon: "0750 456 809",
  platforma: "Shopify",
  produse: "101-500",
  mentiuni: "Am si un blog pe care as vrea sa-l pastrez.",
  acord: true,
};

test("o cerere completa trece", () => {
  assert.equal(verificaCerereMigrare(BUNA).ok, true);
});

test("mentiunile pot lipsi cu totul: e singurul camp neobligatoriu", () => {
  for (const gol of [undefined, "", "   "]) {
    const r = verificaCerereMigrare({ ...BUNA, mentiuni: gol });
    assert.equal(r.ok, true, `au fost respinse mentiuni goale: ${JSON.stringify(gol)}`);
    if (r.ok) assert.equal(r.valoare.mentiuni, "");
  }
});

test("valorile ies CURATATE de spatii, nu cum au intrat", () => {
  const r = verificaCerereMigrare({
    ...BUNA,
    nume: "  Ion Popescu  ",
    email: " ion@exemplu.ro ",
    mentiuni: "  ceva  ",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.valoare.nume, "Ion Popescu");
    assert.equal(r.valoare.email, "ion@exemplu.ro");
    assert.equal(r.valoare.mentiuni, "ceva");
  }
});

/*
 * ⚠ Proba care conteaza cel mai mult din fisier.
 *
 * Listele sunt aratate omului in pagina si trimise inapoi de el. Daca vreo
 * optiune scrisa in `PLATFORME_FORMULAR` sau `MARIMI_CATALOG` n-ar trece
 * verificarea, formularul ar respinge un raspuns pe care chiar el l-a oferit —
 * si s-ar vedea abia cand cineva alege exact optiunea aceea.
 */
test("FIECARE optiune din liste e primita", () => {
  for (const platforma of PLATFORME_FORMULAR) {
    assert.equal(
      verificaCerereMigrare({ ...BUNA, platforma }).ok,
      true,
      `platforma respinsa desi e in lista: ${platforma}`,
    );
  }
  for (const produse of MARIMI_CATALOG) {
    assert.equal(
      verificaCerereMigrare({ ...BUNA, produse }).ok,
      true,
      `marimea respinsa desi e in lista: ${produse}`,
    );
  }
});

test("o platforma din afara listei e respinsa, nu inlocuita cu „Alta”", () => {
  /* Formularul vechi de campanie punea „Alta" peste orice nu recunostea, deci
     un camp trimis de mana ajungea in email ca si cum ar fi fost ales. */
  for (const platforma of ["PrestaShop", "", "  ", "<script>"]) {
    assert.equal(verificaCerereMigrare({ ...BUNA, platforma }).ok, false, platforma);
  }
});

test("o marime de catalog din afara listei e respinsa", () => {
  for (const produse of ["500-600", "multe", ""]) {
    assert.equal(verificaCerereMigrare({ ...BUNA, produse }).ok, false, produse);
  }
});

test("fara bifa nu trece, oricat de completa ar fi cererea", () => {
  for (const acord of [undefined, false]) {
    assert.equal(verificaCerereMigrare({ ...BUNA, acord }).ok, false);
  }
});

test("numerele de telefon scrise in feluri diferite trec toate", () => {
  for (const telefon of ["0750456809", "0750 456 809", "0750.456.809", "+40750456809", "(0750) 456-809"]) {
    assert.equal(
      verificaCerereMigrare({ ...BUNA, telefon }).ok,
      true,
      `numar respins desi e bun: ${telefon}`,
    );
  }
});

test("numerele care nu sunt numere sunt respinse", () => {
  for (const telefon of ["", "07504", "telefon", "0750456809123456"]) {
    assert.equal(verificaCerereMigrare({ ...BUNA, telefon }).ok, false, telefon);
  }
});

test("emailul lipsa sau strambe sunt respinse", () => {
  for (const email of ["", "ion", "ion@exemplu", "ion @exemplu.ro"]) {
    assert.equal(verificaCerereMigrare({ ...BUNA, email }).ok, false, email);
  }
});

test("numele lipsa e respins", () => {
  assert.equal(verificaCerereMigrare({ ...BUNA, nume: "   " }).ok, false);
});

test("plafoanele de lungime opresc un camp umflat", () => {
  assert.equal(verificaCerereMigrare({ ...BUNA, nume: "x".repeat(MAX.nume + 1) }).ok, false);
  assert.equal(verificaCerereMigrare({ ...BUNA, mentiuni: "x".repeat(MAX.mentiuni + 1) }).ok, false);
  /* Exact pe plafon inca trece: plafonul e o limita, nu o margine de siguranta. */
  assert.equal(verificaCerereMigrare({ ...BUNA, mentiuni: "x".repeat(MAX.mentiuni) }).ok, true);
});

test("„Alta” exista in lista: fara ea, cine vine de pe o platforma nelistata n-are ce alege", () => {
  assert.ok(PLATFORME_FORMULAR.includes("Alta"));
});
