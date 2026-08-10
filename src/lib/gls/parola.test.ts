import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { parolaMyGls } from "./parola";

/*
 * ⚠ Integrarea GLS se probeaza DIRECT IN PRODUCTIE, pe contractul unui client
 * real. Nu exista loc unde sa gresim ieftin.
 *
 * Parola e cea mai perfida bucata: daca octetii ies gresit, MyGLS raspunde
 * „autentificare esuata" — exact ce raspunde si la o parola gresita. Ai cauta in
 * datele de acces zile intregi, cand de fapt e formatul. De aia se verifica aici
 * fata de valori SHA-512 cunoscute, nu fata de ce am scris tot eu.
 */

test("intoarce exact 64 de octeti — lungimea unui SHA-512", () => {
  assert.equal(parolaMyGls("parola").length, 64);
  assert.equal(parolaMyGls("").length, 64);
  assert.equal(parolaMyGls("x".repeat(1000)).length, 64);
});

test("toate valorile sunt octeti intregi, 0..255", () => {
  /* Daca ar iesi caractere sau numere negative, MyGLS ar respinge tacut. */
  for (const parola of ["parola", "", "Aa1!", "diacritice: șțăîâ"]) {
    for (const n of parolaMyGls(parola)) {
      assert.ok(Number.isInteger(n), `${n} nu e intreg`);
      assert.ok(n >= 0 && n <= 255, `${n} iese din 0..255`);
    }
  }
});

test("se potriveste cu SHA-512 pe vectorul canonic al sirului gol", () => {
  /* Valoare publica, verificabila oriunde: SHA-512("") incepe cu cf83e135… */
  const hex = Buffer.from(parolaMyGls("")).toString("hex");
  assert.equal(
    hex,
    "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce" +
      "47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
  );
});

test("se potriveste cu SHA-512 pe vectorul canonic „abc”", () => {
  const hex = Buffer.from(parolaMyGls("abc")).toString("hex");
  assert.equal(
    hex,
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
      "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  );
});

test("e rezumatul BRUT, nu codurile caracterelor hexazecimale", () => {
  /*
   * ⚠ Greseala clasica: `hash('sha512', $p)` fara `true` da 128 de caractere
   * hexazecimale, iar `unpack('C*')` le-ar transforma in 128 de coduri ASCII.
   * Proba de aici ar cadea imediat — si ar cadea si autentificarea la GLS,
   * fara sa spuna de ce.
   */
  const gresit = Array.from(Buffer.from(createHash("sha512").update("parola").digest("hex"), "utf8"));
  assert.equal(gresit.length, 128);
  assert.notDeepEqual(parolaMyGls("parola"), gresit);
  assert.equal(parolaMyGls("parola").length, 64);
});

test("parola se codifica UTF-8, ca in PHP", () => {
  /*
   * In PHP sirurile sunt deja secvente de octeti UTF-8, deci un `ă` din parola
   * intra ca doi octeti. Daca aici am folosi latin1 sau utf16, aceeasi parola ar
   * da alt rezumat si autentificarea ar pica DOAR pentru clientii cu diacritice
   * in parola — genul de defect care se descopera dupa luni.
   */
  const asteptat = Array.from(createHash("sha512").update(Buffer.from("parolă", "utf8")).digest());
  assert.deepEqual(parolaMyGls("parolă"), asteptat);
  /* Si dovada ca chiar conteaza: latin1 ar da altceva. */
  const latin1 = Array.from(createHash("sha512").update(Buffer.from("parolă", "latin1")).digest());
  assert.notDeepEqual(parolaMyGls("parolă"), latin1);
});

test("parole diferite dau octeti diferiti, chiar si la o litera", () => {
  assert.notDeepEqual(parolaMyGls("parola"), parolaMyGls("parolA"));
  assert.notDeepEqual(parolaMyGls("parola"), parolaMyGls("parola "));
});

test("aceeasi parola da mereu acelasi rezultat", () => {
  assert.deepEqual(parolaMyGls("Test123!"), parolaMyGls("Test123!"));
});
