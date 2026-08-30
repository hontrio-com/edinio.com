import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { coleteDeTrimis, numarDeColete } from "./colete";


/* ── Cate colete pleaca, dupa auditul din 24.08.2026 ───────────────────────── */

test("eMAG colete: numarul declarat de om bate lista de dimensiuni", () => {
  /*
   * ⚠ CAZUL CARE A SCOS DEFECTUL LA IVEALA.
   *
   * `parcel_number` se lua din `colete?.length ?? 1`. Dar `coleteDeTrimis` intoarce
   * `undefined` cand nu se stiu toate trei laturile, iar ecranul nostru ofera ANUME
   * calea asta: „Goale, nu trimitem nicio dimensiune."
   *
   * Deci trei cutii fara dimensiuni plecau cu `parcel_number: 1`. Curierul venea cu o
   * singura eticheta la trei colete. Nimic nu dadea eroare: 1 e o valoare valida.
   */
  assert.equal(numarDeColete(3, undefined), 3);
  assert.equal(numarDeColete(1, undefined), 1);
});

test("eMAG colete: fara o cerere limpede, se numara dimensiunile", () => {
  const doua = coleteDeTrimis(4, 2, { length: 10, width: 10, height: 10 });
  assert.equal(numarDeColete(undefined, doua), 2);
  assert.equal(numarDeColete(null, doua), 2);
});

test("eMAG colete: niciodata zero", () => {
  /* ⚠ Schema lor: `envelope_number` si `parcel_number` nu pot fi amandoua zero, iar
     noi trimitem mereu `envelope_number: 0`. Deci un zero aici ar fi un AWB refuzat. */
  for (const v of [0, -2, Number.NaN, undefined, null]) {
    assert.equal(numarDeColete(v as number, undefined), 1, `${String(v)} trebuie sa dea 1`);
  }
});

test("eMAG colete: nu se trece de maximul lor", () => {
  /* `parcel_number` are `maximum=999` in schema lor. */
  assert.equal(numarDeColete(5000, undefined), 999);
});

test("eMAG colete: AWB-ul chiar foloseste numarul declarat", () => {
  /* ⚠ Probele de sus verifica REGULA. Asta verifica LOCUL: fara ea, cineva poate pune
     la loc `colete?.length ?? 1` in actiune, iar regula ar ramane corecta si nefolosita. */
  const sursa = readFileSync("src/lib/actions/emag.actions.ts", "utf8");
  assert.equal(sursa.includes("parcel_number: numarDeColete("), true, "actiunea nu mai cheama `numarDeColete`");
  assert.equal(sursa.includes("optiuni?.colete?.length ?? 1"), false, "s-a intors forma veche");
});
