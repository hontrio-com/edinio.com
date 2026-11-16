import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { codulDinTextTbi, citesteVesteaTbi, ETICHETA_STARE_TBI, STARI_TBI, stareaDinVeste, treceLa, type VesteTbi } from "./stari";

const veste = (statusId: VesteTbi["statusId"], motiv = ""): VesteTbi => ({ orderId: "700000001", statusId, mesaj: "", motiv, contract: "" });

describe("citirea vestii descifrate", () => {
  test("✅ forma de pe fir (exemplul criptat din documentatie): litere mici, `status` NUMAR", () => {
    const v = citesteVesteaTbi('{"command":"update_status","order_id":"700000001","status":1,"message":"Plata TBI acceptata","motive":"","contract_id":"2026"}');
    assert.deepEqual(v, { orderId: "700000001", statusId: 1, mesaj: "Plata TBI acceptata", motiv: "", contract: "2026" });
  });
  test("✅ forma din textul documentatiei: `OrderId`, `Status` TEXT, `ContractNumber`", () => {
    const v = citesteVesteaTbi('{"command":"update_status","OrderId":"700000001","Status":"3","Message":"Comanda anulata TBI","Motive":" Criterii eligibilitate ","ContractNumber":"9"}');
    assert.deepEqual(v, { orderId: "700000001", statusId: 3, mesaj: "Comanda anulata TBI", motiv: "Criterii eligibilitate", contract: "9" });
  });
  test("tabelul lor zice `Contract_id`: se primeste si asa", () => {
    const v = citesteVesteaTbi('{"OrderId":"1","Status":"2","Contract_id":"77"}');
    assert.ok(!("eroare" in v) && v.contract === "77");
  });
  test("`order_id` numar se primeste ca text", () => {
    const v = citesteVesteaTbi('{"order_id":700000001,"status":2}');
    assert.ok(!("eroare" in v) && v.orderId === "700000001");
  });
  test("⚠ orice abatere e o eroare spusa, nu o stare ghicita", () => {
    for (const rau of ["nu e json", "[]", "null", '{"status":1}', '{"order_id":"1","status":9}', '{"order_id":"1","status":"aprobat"}',
      '{"command":"altceva","order_id":"1","status":1}']) {
      assert.ok("eroare" in citesteVesteaTbi(rau), rau);
    }
  });
});

test("codurile: 1 aprobata, 2 in lucru, 0 anulata, ⚠ 3 respinsa (acelasi text ca 0), 4-6 rambursari", () => {
  assert.equal(stareaDinVeste({ statusId: 1 }), "aprobata");
  assert.equal(stareaDinVeste({ statusId: 2 }), "in_analiza");
  assert.equal(stareaDinVeste({ statusId: 0 }), "anulata");
  assert.equal(stareaDinVeste({ statusId: 3 }), "respinsa");
  for (const c of [4, 5, 6] as const) assert.equal(stareaDinVeste({ statusId: c }), null);
});

describe("trecerile", () => {
  test("aprobarea plateste din ORICE stare, si de fiecare data (plata e idempotenta)", () => {
    for (const s of STARI_TBI) assert.deepEqual(treceLa(s, veste(1)), { stare: "aprobata", efect: "plateste" });
  });
  test("⚠ o veste „in lucru” sosita DUPA aprobare nu intoarce nimic", () => {
    assert.deepEqual(treceLa("aprobata", veste(2)), { stare: "aprobata", efect: "nimic" });
  });
  test("⚠⚠ anularea sau respingerea dupa aprobare se spune tare, si nu e confundata cu una obisnuita", () => {
    assert.deepEqual(treceLa("aprobata", veste(0)), { stare: "anulata", efect: "anulata_dupa_aprobare" });
    assert.deepEqual(treceLa("aprobata", veste(3)), { stare: "respinsa", efect: "anulata_dupa_aprobare" });
  });
  test("o veste repetata nu mai spune nimic", () => {
    assert.deepEqual(treceLa("respinsa", veste(3)), { stare: "respinsa", efect: "nimic" });
    assert.deepEqual(treceLa("anulata", veste(0)), { stare: "anulata", efect: "nimic" });
    assert.deepEqual(treceLa("in_analiza", veste(2)), { stare: "in_analiza", efect: "nimic" });
  });
  test("din cererile deschise, respingerea si anularea se spun o data", () => {
    for (const s of ["creata", "trimisa", "in_analiza"] as const) {
      assert.deepEqual(treceLa(s, veste(3)), { stare: "respinsa", efect: "respinsa" });
      assert.deepEqual(treceLa(s, veste(0)), { stare: "anulata", efect: "anulata" });
    }
  });
  test("⚠ rambursarile privesc DOAR un credit aprobat: 6 intoarce banii, 4 si 5 doar se noteaza", () => {
    assert.deepEqual(treceLa("aprobata", veste(4)), { stare: "aprobata", efect: "rambursare_in_curs" });
    assert.deepEqual(treceLa("aprobata", veste(5)), { stare: "aprobata", efect: "rambursare_in_curs" });
    assert.deepEqual(treceLa("aprobata", veste(6)), { stare: "aprobata", efect: "rambursata" });
    for (const s of ["trimisa", "anulata", "respinsa"] as const) assert.deepEqual(treceLa(s, veste(6)), { stare: s, efect: "nimic" });
  });
});

test("⚠ starea scrisa de GetApplicationStatus (masurata pe serverul lor de test) se traduce; un text nou nu se ghiceste", () => {
  assert.equal(codulDinTextTbi("Plata TBI acceptata"), 1);
  assert.equal(codulDinTextTbi("Comanda in derulare TBI"), 2);
  assert.equal(codulDinTextTbi("Comanda anulata TBI"), 0);
  assert.equal(codulDinTextTbi("CanceledByCustomer"), 0);
  assert.equal(codulDinTextTbi("  comanda ANULATĂ tbi "), 0);
  assert.equal(codulDinTextTbi("Comanda trimisa catre TBI"), null, "trimisa nu schimba nimic: cererea e deja trimisa");
  assert.equal(codulDinTextTbi("Ceva nou"), null);
});

test("fiecare stare are eticheta pentru panou", () => {
  for (const s of STARI_TBI) assert.ok(ETICHETA_STARE_TBI[s]);
});
