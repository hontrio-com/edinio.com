import assert from "node:assert/strict";
import { test } from "node:test";
import { disponibilitate, stocExportat } from "./stoc";

test("stocul de siguranta se scade din cel real", () => {
  assert.equal(stocExportat(5, 2), 3);
  assert.equal(stocExportat(1, 2), 0);
  assert.equal(stocExportat(100, 0), 100);
});

test("⚠ nu pleaca niciodata stoc negativ", () => {
  /* Stocul din Edinio poate ajunge negativ dupa o cursa de comenzi. Trimis ca atare,
     `<Quantity>-3</Quantity>` ar fi ori respins, ori citit ca 3. */
  assert.equal(stocExportat(-3, 0), 0);
  assert.equal(stocExportat(-3, 5), 0);
});

test("stocul se trimite intreg, nu cu zecimale", () => {
  assert.equal(stocExportat(7.9, 0), 7);
  assert.equal(stocExportat(7.9, 2.5), 5);
});

test("stocul necunoscut se citeste ca zero, nu ca „oricat”", () => {
  /* Fail-safe: mai bine un produs care nu se vinde decat unul vandut si neonorat. */
  assert.equal(stocExportat(null, 0), 0);
  assert.equal(stocExportat(undefined, 0), 0);
  assert.equal(stocExportat(Number.NaN, 0), 0);
});

test("stoc zero inseamna `Available=false` si `Quantity=0`", () => {
  assert.deepEqual(disponibilitate({ tineEvidenta: true, stoc: 0, siguranta: 0 }), {
    disponibil: false, cantitate: 0,
  });
});

test("stocul consumat de siguranta inchide vanzarea la ei, nu si in magazin", () => {
  assert.deepEqual(disponibilitate({ tineEvidenta: true, stoc: 2, siguranta: 2 }), {
    disponibil: false, cantitate: 0,
  });
});

test("⚠ fara evidenta de stoc NU se inventeaza o cantitate", () => {
  /*
   * Un numar pus de noi (99, 1000) ar fi o minciuna pe care marketplace-ul o afiseaza
   * clientului ca „mai sunt N bucati". `null` inseamna „elementul lipseste din XML".
   */
  assert.deepEqual(disponibilitate({ tineEvidenta: false, stoc: null, siguranta: 0 }), {
    disponibil: true, cantitate: null,
  });
});

test("⚠ pachetul isi ia disponibilitatea din componente, nu din campul lui de stoc", () => {
  /* Pachetele se scriu cu `track_inventory: false`, deci fara verdictul impus ar fi
     plecat toate ca „pe stoc", inclusiv cele cu componentele sterse. */
  assert.deepEqual(disponibilitate({ tineEvidenta: false, stoc: null, siguranta: 0, disponibilImpus: false }), {
    disponibil: false, cantitate: null,
  });
  assert.deepEqual(disponibilitate({ tineEvidenta: false, stoc: null, siguranta: 0, disponibilImpus: true }), {
    disponibil: true, cantitate: null,
  });
});
