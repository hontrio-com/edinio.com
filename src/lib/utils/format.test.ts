import assert from "node:assert/strict";
import { test } from "node:test";
import { unitarSeInchide } from "./format";

/**
 * Pagina de confirmare si formularul de retur sunt singurele doua locuri care
 * arata pretul UNITAR al unei linii, nu doar totalul ei. Pe o linie de pachet
 * pretul unitar e nerotunjit dinadins (250 lei pe 3 bucati inseamna 83,3333, ca
 * `pret x cantitate` sa dea exact subtotalul comenzii), iar scurtat la doua
 * zecimale nu se mai inmulteste inapoi: „3 x 83,33 lei" langa „250,00 lei".
 */

test("un pret obisnuit se inmulteste inapoi si se arata", () => {
  assert.equal(unitarSeInchide(19.99, 2), true);
  assert.equal(unitarSeInchide(7.45, 1), true);
  assert.equal(unitarSeInchide(1244.88, 3), true);
});

test("pachetul Mokka: 3 bucati la 250 lei nu se inchide", () => {
  // 83,33 x 3 = 249,99, iar totalul de langa scrie 250,00.
  assert.equal(unitarSeInchide(250 / 3, 3), false);
});

test("jumatatea de ban: 2 bucati la 13,41 nu se inchide nici in sus, nici in jos", () => {
  // 6,705 se scurteaza la 6,70 sau 6,71 dupa cum cade ultimul bit; niciuna
  // dintre cele doua nu da 13,41 inmultita cu doi.
  assert.equal(unitarSeInchide(13.41 / 2, 2), false);
  assert.equal(unitarSeInchide(10.45 / 2, 2), false);
});

test("o singura bucata se inchide mereu: nu e nimic de inmultit", () => {
  assert.equal(unitarSeInchide(250 / 3, 1), true);
});

test("pretul care vine ca text sau lipseste nu arunca", () => {
  assert.equal(unitarSeInchide("19.99" as unknown as number, 2), true);
  assert.equal(unitarSeInchide(0, 3), true);
});
