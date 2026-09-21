import test from "node:test";
import assert from "node:assert/strict";

import { adunaEtichete, type ComandaDeAdunat, type OcteteSauMotiv } from "./etichete-adunate";

/** O comanda cu AWB la Woot. */
function cu(numar: string, coloana = "woot_order_id", valoare: unknown = "W1"): ComandaDeAdunat {
  return { id: `id-${numar}`, order_number: numar, rand: { [coloana]: valoare } };
}

/** Lipitorul de proba: pastreaza ordinea si lungimile, ca sa se poata verifica. */
const lipesteDeProba = async (d: Uint8Array[]) =>
  new Uint8Array(d.flatMap((x) => [...x]));

const octeti = (...n: number[]) => ({ ok: true as const, octeti: new Uint8Array(n) });

test("toate etichetele intra in document, in ordinea selectiei", async () => {
  const r = await adunaEtichete(
    [cu("1001"), cu("1002"), cu("1003")],
    async (c) => octeti(Number(c.order_number) - 1000),
    lipesteDeProba,
  );
  assert.deepEqual([...(r.pdf ?? [])], [1, 2, 3]);
  assert.deepEqual(r.incluse, ["1001", "1002", "1003"]);
  assert.deepEqual(r.sarite, []);
  assert.equal(r.oprit, false);
});

test("⚠⚠ paginile ies in ordinea SELECTIEI, nu in ordinea raspunsurilor", async () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA CEVA CARE NU SE VEDE. Aducerile merg in paralel, deci
   * a treia comanda poate raspunde prima. Puse in ordinea sosirii, paginile ar iesi
   * amestecate — iar comerciantul lipeste eticheta de pe pagina N pe coletul N. Doua
   * colete schimbate intre ele inseamna doua livrari gresite, aflate de la clienti.
   *
   * Aici raspunsurile vin INTENTIONAT pe dos: ultima comanda intoarce imediat, prima
   * asteapta cel mai mult.
   */
  const intarziere = { "1001": 30, "1002": 15, "1003": 0 } as Record<string, number>;
  const r = await adunaEtichete(
    [cu("1001"), cu("1002"), cu("1003")],
    async (c) => {
      await new Promise((res) => setTimeout(res, intarziere[c.order_number]));
      return octeti(Number(c.order_number) - 1000);
    },
    lipesteDeProba,
    { concurenta: 3 },
  );
  assert.deepEqual([...(r.pdf ?? [])], [1, 2, 3], "paginile s-au amestecat");
  assert.deepEqual(r.incluse, ["1001", "1002", "1003"]);
});

test("comanda fara nicio expediere se sare, si se spune de ce", async () => {
  const r = await adunaEtichete(
    [cu("1001"), { id: "x", order_number: "1002", rand: {} }],
    async () => octeti(7),
    lipesteDeProba,
  );
  assert.deepEqual(r.incluse, ["1001"]);
  assert.equal(r.sarite.length, 1);
  assert.equal(r.sarite[0].comanda, "1002");
  assert.match(r.sarite[0].motiv, /AWB/);
});

test("⚠ o eticheta refuzata nu o scoate pe celelalte din document", async () => {
  const r = await adunaEtichete(
    [cu("1001"), cu("1002"), cu("1003")],
    async (c): Promise<OcteteSauMotiv> =>
      c.order_number === "1002" ? { ok: false, motiv: "nu e PDF" } : octeti(9),
    lipesteDeProba,
  );
  assert.deepEqual(r.incluse, ["1001", "1003"]);
  assert.deepEqual(r.sarite, [{ comanda: "1002", motiv: "nu e PDF" }]);
  assert.equal(r.pdf?.length, 2);
});

test("⚠⚠ o ARUNCARE la un curier nu doboara tot lotul", async () => {
  /*
   * Fara prinderea din bucla, un singur curier picat l-ar fi lasat pe comerciant
   * fara NICIUNA dintre celelalte etichete, si tot el ar fi trebuit sa ghiceasca de
   * la care a pornit.
   */
  const r = await adunaEtichete(
    [cu("1001"), cu("1002")],
    async (c) => {
      if (c.order_number === "1001") throw new Error("curierul nu a raspuns");
      return octeti(5);
    },
    lipesteDeProba,
  );
  assert.deepEqual(r.incluse, ["1002"]);
  assert.equal(r.sarite.length, 1);
  assert.match(r.sarite[0].motiv, /Woot: curierul nu a raspuns/);
});

test("fara nicio eticheta adunata, documentul e null si nu se lipeste nimic", async () => {
  let chemat = 0;
  const r = await adunaEtichete(
    [{ id: "x", order_number: "1002", rand: {} }],
    async () => octeti(1),
    async (d) => { chemat++; return lipesteDeProba(d); },
  );
  assert.equal(r.pdf, null);
  assert.equal(chemat, 0, "lipitorul n-are ce face cu zero documente");
  assert.deepEqual(r.incluse, []);
});

test("⚠ lotul oprit la termen SPUNE ca restul n-au fost incercate", async () => {
  /*
   * Fara steag, `incluse + sarite < total` arata ca un defect: omul vede 2 etichete
   * dintr-o selectie de 5 si nu stie ce s-a intamplat cu celelalte 3. Cu el, stie ca
   * le poate relua in siguranta — aducerea e o citire, nu cheltuie nimic.
   */
  let ceas = 0;
  const r = await adunaEtichete(
    [cu("1"), cu("2"), cu("3"), cu("4"), cu("5")],
    async () => octeti(1),
    lipesteDeProba,
    { concurenta: 1, termenMs: 3, acum: () => (ceas += 1) },
  );
  assert.equal(r.oprit, true);
  assert.ok(r.incluse.length < 5, `au intrat ${r.incluse.length}, trebuia sa se opreasca`);
});

test("un lot care le atinge pe toate NU se declara oprit", async () => {
  const r = await adunaEtichete(
    [cu("1"), cu("2")],
    async () => octeti(1),
    lipesteDeProba,
    { concurenta: 1 },
  );
  assert.equal(r.oprit, false);
});

test("⚠ o aducere PORNITA nu se intrerupe la termen", async () => {
  /*
   * Termenul opreste pornirea alteia, nu lucrarea in curs: un apel lasat in aer ar
   * insemna o cerere la curier al carei raspuns nu-l mai citeste nimeni.
   */
  let ceas = 0;
  let terminate = 0;
  const r = await adunaEtichete(
    [cu("1"), cu("2"), cu("3")],
    async () => { await new Promise((res) => setTimeout(res, 1)); terminate++; return octeti(1); },
    lipesteDeProba,
    { concurenta: 1, termenMs: 2, acum: () => (ceas += 1) },
  );
  assert.equal(terminate, r.incluse.length, "o aducere pornita trebuie dusa pana la capat");
  assert.equal(r.oprit, true);
});
