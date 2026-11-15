import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { citesteVesteaTbi, stareaDinVeste, treceLa, STARI_TBI, ETICHETA_STARE_TBI, type StareTbi, type VesteTbi } from "./stari";

const v = (statusId: 0 | 1 | 2, motiv = ""): VesteTbi => ({ orderId: "700000001", statusId, motiv });

describe("citirea vestii descifrate", () => {
  test("✅ forma de pe fir (masurata pe vestea-exemplu tbi): `status_id` NUMAR", () => {
    assert.deepEqual(citesteVesteaTbi('{"order_id":"528413423","status_id":1,"motiv":""}'),
      { orderId: "528413423", statusId: 1, motiv: "" });
  });
  test("✅ forma din documentatie: `status_id` TEXT, motiv cu spatii", () => {
    assert.deepEqual(citesteVesteaTbi('{"order_id":"145003523","status_id":"0","motiv":" Criterii eligibilitate"}'),
      { orderId: "145003523", statusId: 0, motiv: "Criterii eligibilitate" });
  });
  test("`order_id` numar se primeste ca text", () => {
    const r = citesteVesteaTbi('{"order_id":700000001,"status_id":2,"motiv":"Semnare contract"}');
    assert.deepEqual(r, { orderId: "700000001", statusId: 2, motiv: "Semnare contract" });
  });
  test("⚠ orice abatere e o eroare spusa, nu o stare ghicita", () => {
    for (const rau of ["nu e json", "[]", "null", '{"status_id":1}', '{"order_id":"1","status_id":3}', '{"order_id":"1","status_id":"1a"}', '{"order_id":"","status_id":1}', '{"order_id":"1"}']) {
      assert.ok("eroare" in citesteVesteaTbi(rau), rau);
    }
  });
  test("motivul lung se taie", () => {
    const r = citesteVesteaTbi(JSON.stringify({ order_id: "1", status_id: 0, motiv: "x".repeat(1000) }));
    assert.ok(!("eroare" in r) && r.motiv.length === 300);
  });
});

test("⚠ la 0, DOAR motivul desparte respingerea bancii de anulare", () => {
  assert.equal(stareaDinVeste(v(1)), "aprobata");
  assert.equal(stareaDinVeste(v(2, "In analiza")), "in_analiza");
  assert.equal(stareaDinVeste(v(0)), "anulata");
  assert.equal(stareaDinVeste(v(0, "Respins Biroul de Credit")), "respinsa");
});

describe("trecerile", () => {
  test("aprobarea plateste din ORICE stare, si de fiecare data (plata e idempotenta)", () => {
    for (const s of STARI_TBI) assert.deepEqual(treceLa(s, v(1)), { stare: "aprobata", efect: "plateste" }, s);
  });
  test("⚠ o veste „in analiza” sosita DUPA aprobare nu intoarce nimic", () => {
    assert.deepEqual(treceLa("aprobata", v(2, "Semnare")), { stare: "aprobata", efect: "nimic" });
  });
  test("⚠⚠ anularea sau respingerea dupa aprobare se spune tare, si nu e confundata cu una obisnuita", () => {
    assert.deepEqual(treceLa("aprobata", v(0)), { stare: "anulata", efect: "anulata_dupa_aprobare" });
    assert.deepEqual(treceLa("aprobata", v(0, "Retragere")), { stare: "respinsa", efect: "anulata_dupa_aprobare" });
  });
  test("o veste repetata nu mai spune nimic", () => {
    assert.deepEqual(treceLa("respinsa", v(0, "Criterii eligibilitate")), { stare: "respinsa", efect: "nimic" });
    assert.deepEqual(treceLa("anulata", v(0)), { stare: "anulata", efect: "nimic" });
    assert.deepEqual(treceLa("in_analiza", v(2, "alta etapa")), { stare: "in_analiza", efect: "nimic" });
  });
  test("din cererile deschise, respingerea si anularea se spun o data", () => {
    for (const s of ["creata", "trimisa", "in_analiza", "eroare"] as StareTbi[]) {
      assert.deepEqual(treceLa(s, v(0, "Criterii eligibilitate")), { stare: "respinsa", efect: "respinsa" }, s);
      assert.deepEqual(treceLa(s, v(0)), { stare: "anulata", efect: "anulata" }, s);
    }
  });
  test("o cerere respinsa poate fi redeschisa de banca (reanaliza)", () => {
    assert.deepEqual(treceLa("respinsa", v(2, "Reanaliza")), { stare: "in_analiza", efect: "nimic" });
  });
});

test("fiecare stare are eticheta pentru panou", () => {
  for (const s of STARI_TBI) assert.ok(ETICHETA_STARE_TBI[s]?.length > 3, s);
});
