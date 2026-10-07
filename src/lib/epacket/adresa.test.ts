import { strict as assert } from "node:assert";
import { test } from "node:test";

import { despartaAdresa } from "./adresa";

const d = despartaAdresa;

test("formele cu eticheta, scrise de oameni", () => {
  assert.deepEqual(d("Str. Mare nr. 12, bl. A2, sc. B, et. 3, ap. 7"),
    { strada: "Str. Mare", numar: "12", bloc: "A2", scara: "B", etaj: "3", apartament: "7", codPostal: "" });
  assert.deepEqual(d("Strada Florilor Nr12 bl A2 ap 7"),
    { strada: "Strada Florilor", numar: "12", bloc: "A2", scara: "", etaj: "", apartament: "7", codPostal: "" });
  assert.deepEqual(d("Calea Victoriei, Nr 25A"),
    { strada: "Calea Victoriei", numar: "25A", bloc: "", scara: "", etaj: "", apartament: "", codPostal: "" });
  assert.equal(d("Aleea Parang bloc 4 scara 1 etaj parter apartament 2").etaj, "parter");
  assert.equal(d("Sos. Oltenitei numarul 2").numar, "2");
});

test("numarul fara eticheta e ULTIMUL cuvant numeric al strazii", () => {
  assert.deepEqual(d("Str. Lunga 3/B"), { strada: "Str. Lunga", numar: "3/B", bloc: "", scara: "", etaj: "", apartament: "", codPostal: "" });
  assert.equal(d("Calea 13 Septembrie 90").numar, "90");
  assert.equal(d("Calea 13 Septembrie 90").strada, "Calea 13 Septembrie");
  assert.equal(d("Bd. Unirii 12, bl. A2").numar, "12");
  assert.equal(d("Strada Mare 12, Cluj-Napoca").strada, "Strada Mare");
  assert.equal(d("Strada Viilor 7 bis").numar, "7 bis");
  assert.equal(d("Strada Mare, 12").numar, "12");
});

test("⚠ un numar din NUMELE strazii nu e numarul casei, si nimic nu se inventeaza", () => {
  assert.equal(d("Bd. 1 Mai").numar, "", "„1” e al numelui");
  assert.equal(d("Bd. 1 Mai").strada, "Bd. 1 Mai");
  assert.equal(d("Strada Florilor").numar, "");
  assert.equal(d("").strada, "");
  assert.equal(d(null).numar, "");
});

test("⚠ cuvintele care incep ca o eticheta nu sunt etichete", () => {
  /* „Etajului", „Scarisoara", „Blocurilor" nu sunt etaj, scara si bloc. */
  const a = d("Strada Scarisoarei 5");
  assert.equal(a.strada, "Strada Scarisoarei");
  assert.equal(a.scara, "");
  assert.equal(d("Aleea Blocurilor 3").bloc, "");
  assert.equal(d("Str. Etajului 4").etaj, "");
});

test("satul fara strada: „sat X nr 40” isi pastreaza satul ca strada", () => {
  const a = d("sat Ghimes, nr 40");
  assert.equal(a.numar, "40");
  assert.equal(a.strada, "sat Ghimes");
});

test("formele masurate pe adresele reale (valorile sunt inventate, FORMA e a lor)", () => {
  /* Text liber dupa numar: numarul e primul cuvant, restul ramane langa strada. */
  const a = d("Calea Bucuresti nr 125 langa benzinarie");
  assert.equal(a.numar, "125");
  assert.equal(a.strada, "Calea Bucuresti langa benzinarie");
  /* Numarul lipit de cuvant. */
  const b = d("Strada Florilor12");
  assert.equal(b.numar, "12");
  assert.equal(b.strada, "Strada Florilor");
  /* Etichetele lipite. */
  const c = d("Strada Mare, blA, sc1, ap12");
  assert.equal(c.bloc, "A");
  assert.equal(c.scara, "1");
  assert.equal(c.apartament, "12");
  /* Codul postal din linie se scoate si nu e luat drept numar. */
  const e = d("Str. Viitorului 23A Pitesti 110001");
  assert.equal(e.codPostal, "110001");
  assert.equal(e.numar, "", "„Pitesti” e ultimul cuvant, deci nu se ghiceste numarul");
  const f = d("Str. Viitorului 23A, 110001");
  assert.equal(f.codPostal, "110001");
  assert.equal(f.numar, "23A");
  /* „FN" se pastreaza. */
  assert.equal(d("sat Ghimes nr FN").numar, "FN");
});

test("paranteza lipita de numar incheie numarul", () => {
  const a = d("strada Morii, nr 12A(langa piata)");
  assert.equal(a.numar, "12A");
  assert.equal(a.strada, "strada Morii langa piata");
});
