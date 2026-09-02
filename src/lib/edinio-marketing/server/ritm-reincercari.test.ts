import { strict as assert } from "node:assert";
import { test } from "node:test";
import { dupaEsec, candSeReincearca, PAUZE_MINUTE, MAX_INCERCARI } from "./ritm-reincercari";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  RITMUL REINCERCARILOR
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SE PROBEAZA REGULA, NU FORMA. Nu ne uitam daca tabloul contine anumite cifre
  — ci daca sirul de pauze pe care le-ar primi o conversie esuata e chiar cel
  descris in comentariu. Un `PAUZE_MINUTE` corect, citit cu un indice gresit,
  trece de orice proba care se uita doar la tablou.
*/

/** Sirul adevarat de pauze, jucand esecurile unul dupa altul. */
function sirulTrait(): { pauze: number[]; incercariPanaLaAbandon: number } {
  const pauze: number[] = [];
  for (let incercari = 1; incercari <= 50; incercari++) {
    const h = dupaEsec(incercari);
    if (h.fel === "abandoneaza") return { pauze, incercariPanaLaAbandon: incercari };
    pauze.push(h.pesteMinute);
  }
  throw new Error("nu se abandoneaza niciodata — coada nu s-ar goli");
}

test("dupa primul esec se primeste PRIMA pauza, nu a doua", () => {
  const h = dupaEsec(1);
  assert.equal(h.fel, "reincearca");
  assert.equal(
    h.fel === "reincearca" ? h.pesteMinute : -1,
    PAUZE_MINUTE[0],
    "comentariul spune 'dupa primul esec se cheama cu 1 si se primeste prima pauza'",
  );
});

test("fiecare pauza declarata chiar se foloseste", () => {
  const { pauze } = sirulTrait();
  assert.deepEqual(
    pauze,
    [...PAUZE_MINUTE],
    "o pauza pe care niciun esec n-o atinge e cod mort care minte cititorul",
  );
});

test("se abandoneaza, si nu dupa mai mult de sapte zile", () => {
  const { pauze, incercariPanaLaAbandon } = sirulTrait();
  assert.ok(incercariPanaLaAbandon <= 20, "prea multe incercari");
  assert.equal(incercariPanaLaAbandon, MAX_INCERCARI);
  const totalMinute = pauze.reduce((a, b) => a + b, 0);
  assert.ok(
    totalMinute < 7 * 24 * 60,
    `ultima incercare la ${totalMinute} min — furnizorii resping ce e mai vechi de 7 zile`,
  );
});

test("pauzele cresc, niciodata nu scad", () => {
  const { pauze } = sirulTrait();
  for (let i = 1; i < pauze.length; i++) {
    assert.ok(pauze[i] >= pauze[i - 1], `pauza ${i} (${pauze[i]}) mai mica decat ${pauze[i - 1]}`);
  }
});

test("un numar stricat de incercari nu abandoneaza si nu da NaN", () => {
  for (const rau of [0, -3, NaN, Infinity]) {
    const h = dupaEsec(rau);
    assert.equal(h.fel, "reincearca", `${rau} a dus la abandon`);
    assert.ok(h.fel === "reincearca" && Number.isFinite(h.pesteMinute), `${rau} a dat o pauza nefinita`);
  }
});

test("candSeReincearca chiar adauga minutele, ca sir ISO", () => {
  const acum = new Date("2026-09-02T10:00:00.000Z");
  assert.equal(candSeReincearca(acum, 20), "2026-09-02T10:20:00.000Z");
  assert.ok(candSeReincearca(acum, 0) === acum.toISOString());
});
