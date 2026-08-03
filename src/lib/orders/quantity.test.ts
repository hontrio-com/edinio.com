import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CANTITATE_LINIE, cantitateCeruta, mesajCantitate, normalizeazaCantitate } from "./quantity";

/**
 * Ambele actiuni de comanda sunt endpointuri publice, deci cantitatea vine ca
 * text arbitrar. Regula era scrisa de patru ori si nu spunea de fiecare data
 * acelasi lucru: undeva se plafona in tacere, altundeva se scotea linia.
 */

test("o cantitate obisnuita trece asa cum e", () => {
  assert.deepEqual(cantitateCeruta(3), { fel: "ok", cantitate: 3 });
  assert.deepEqual(cantitateCeruta("3"), { fel: "ok", cantitate: 3 });
  assert.deepEqual(cantitateCeruta(MAX_CANTITATE_LINIE), { fel: "ok", cantitate: MAX_CANTITATE_LINIE });
});

test("fractiile se taie in jos, deci o jumatate de bucata nu e o bucata", () => {
  // 0,5 devenea 0 si linia se pierdea in tacere; acum se spune pe fata.
  assert.deepEqual(cantitateCeruta(0.5), { fel: "prea_mica" });
  assert.deepEqual(cantitateCeruta(1.5), { fel: "ok", cantitate: 1 });
});

test("nenumericul nu se strecoara intre cele doua porti", () => {
  // `NaN < 1` e fals SI `NaN > 999` e fals: fara verificarea de NaN, o cantitate
  // nenumerica iesea „ok" si `round2` o inghitea apoi in zero la subtotal.
  for (const rau of [NaN, -Infinity, "abc", null, undefined, {}, [], ""]) {
    assert.equal(cantitateCeruta(rau).fel, "prea_mica", String(rau));
  }
});

test("infinitul e o cantitate PREA MARE, nu una nevalida", () => {
  // `JSON.parse("1e400")` da Infinity dintr-un payload trivial. Trimis pe ramura
  // cealalta, clientul primea „reincarca pagina" in loc de „cel mult 999 bucati".
  assert.deepEqual(cantitateCeruta(Infinity), { fel: "prea_mare", plafon: MAX_CANTITATE_LINIE });
  assert.equal(normalizeazaCantitate(Infinity), MAX_CANTITATE_LINIE);
});

test("negativul si zero nu sunt cantitati", () => {
  assert.deepEqual(cantitateCeruta(0), { fel: "prea_mica" });
  assert.deepEqual(cantitateCeruta(-2), { fel: "prea_mica" });
});

test("peste plafon se REFUZA, nu se rescrie la 999", () => {
  // Rescris, cine cere 5000 primeste si treapta de pret a lui 999, adica alt
  // pret unitar decat cel de pe ecran.
  assert.deepEqual(cantitateCeruta(5000), { fel: "prea_mare", plafon: 999 });
});

test("mesajul spune NUMARUL si, cand se stie, produsul", () => {
  assert.match(mesajCantitate({ fel: "prea_mare", plafon: 999 }), /999 bucati/);
  assert.match(mesajCantitate({ fel: "prea_mare", plafon: 999 }, "Prosop"), /Prosop/);
  assert.match(mesajCantitate({ fel: "prea_mica" }), /nu este valida/);
});

test("in browser se clemeaza, nu se refuza: campul n-are unde arata o eroare", () => {
  assert.equal(normalizeazaCantitate(0.5), 1);
  assert.equal(normalizeazaCantitate(-3), 1);
  assert.equal(normalizeazaCantitate(NaN), 1);
  assert.equal(normalizeazaCantitate(1e9), MAX_CANTITATE_LINIE);
  assert.equal(normalizeazaCantitate(4), 4);
});
