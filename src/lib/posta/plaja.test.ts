import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  avertismentePlaja,
  codurileRamase,
  formeazaCod,
  problemePlaja,
  LUNGIME_COD_ASTEPTATA,
  type PlajaConfig,
} from "./plaja";

const PLAJA: PlajaConfig = { prefix: "LN", deLa: 91_000_000_000, panaLa: 91_000_000_999, cifre: 11 };

test("codul se compune ca in SQL: prefix + numar completat cu zerouri", () => {
  assert.equal(formeazaCod("LN", 91_000_000_000, 11), "LN91000000000");
  assert.equal(formeazaCod("LN", 1, 11), "LN00000000001");
  assert.equal(formeazaCod("", 42, 4), "0042");
});

test("codurile ies de 13 caractere, ca in toate exemplele lor", () => {
  assert.equal(formeazaCod(PLAJA.prefix, PLAJA.deLa, PLAJA.cifre).length, LUNGIME_COD_ASTEPTATA);
});

test("⚠ un numar mai lung decat plafonul de cifre NU se taie", () => {
  /* Taiat, ar iesi un cod din alta plaja — poate a altui client. */
  assert.equal(formeazaCod("LN", 123456, 3), "LN123456");
});

test("se numara cate coduri mai sunt", () => {
  assert.equal(codurileRamase(PLAJA, PLAJA.deLa), 1000);
  assert.equal(codurileRamase(PLAJA, PLAJA.panaLa), 1);
  assert.equal(codurileRamase(PLAJA, PLAJA.panaLa + 1), 0);
});

test("o plaja intreaga nu are probleme", () => {
  assert.deepEqual(problemePlaja(PLAJA), []);
});

test("capetele intoarse se prind", () => {
  const p = problemePlaja({ ...PLAJA, deLa: 100, panaLa: 10 });
  assert.equal(p.length, 1);
  assert.ok(p[0].includes("mai mare decat ultimul"), p[0]);
});

test("numerele care nu incap in cifrele configurate se prind", () => {
  const p = problemePlaja({ ...PLAJA, cifre: 5 });
  assert.ok(p.some((x) => x.includes("cifre")), p.join(" | "));
});

test("prefixul cu separatoare se respinge", () => {
  assert.ok(problemePlaja({ ...PLAJA, prefix: "LN-" }).some((x) => x.includes("prefixul")));
});

test("valorile care nu sunt numere se prind inainte de orice altceva", () => {
  const p = problemePlaja({ prefix: "LN", deLa: NaN, panaLa: 10, cifre: 11 });
  assert.equal(p.length, 1);
  assert.ok(p[0].includes("primul numar"), p[0]);
});

test("⚠ o lungime neasteptata AVERTIZEAZA, dar nu opreste", () => {
  /* N-am vazut niciodata o plaja adevarata, deci n-avem dreptul sa refuzam una
     care arata altfel. Comerciantul o are din contract. */
  const scurta: PlajaConfig = { prefix: "LN", deLa: 1, panaLa: 999, cifre: 3 };
  assert.deepEqual(problemePlaja(scurta), [], "nu opreste");
  const av = avertismentePlaja(scurta);
  assert.equal(av.length, 1);
  assert.ok(av[0].includes(String(LUNGIME_COD_ASTEPTATA)), av[0]);
});

test("o plaja buna nu avertizeaza nimic", () => {
  assert.deepEqual(avertismentePlaja(PLAJA), []);
});

test("o plaja gresita nu mai avertizeaza pe deasupra: intai se repara problemele", () => {
  assert.deepEqual(avertismentePlaja({ ...PLAJA, deLa: 100, panaLa: 10 }), []);
});
