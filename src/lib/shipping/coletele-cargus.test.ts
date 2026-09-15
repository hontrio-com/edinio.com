import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coleteleCargus, impartireEgala, MAX_COLETE, MAX_PLICURI } from "./coletele-cargus";

const BAZA = { parcels: 1, envelopes: 0, totalWeightKg: 2, parcelsDetails: [{ weight: 2 }] };

test("⚠⚠ trei colete primesc TREI fise, nu una care le cantareste pe toate", () => {
  /*
   * ASTA E DEFECTUL. Fereastra trimitea `parcels: 3` cu o singura fisa, de greutatea intreaga.
   * Corpul spunea deodata trei bucati si un singur cod de colet. O eticheta tiparita pentru
   * trei colete inseamna doua colete plecate fara eticheta: nu se vede ca eroare nicaieri, se
   * vede ca marfa pierduta.
   */
  const v = coleteleCargus({ parcels: 3, envelopes: 0, totalWeightKg: 9, parcelsDetails: [{ weight: 9 }] });
  assert.equal(v.ok, true);
  assert.ok(v.ok);
  assert.equal(v.colete.fise.length, 3);
  assert.equal(v.colete.fise.reduce((s, f) => s + f.weight, 0), 9);
});

test("⚠ greutatea se IMPARTE, nu se inventeaza: suma ramane exact cat a spus omul", () => {
  const v = coleteleCargus({ parcels: 3, envelopes: 0, totalWeightKg: 10, parcelsDetails: [] });
  assert.ok(v.ok);
  const suma = v.colete.fise.reduce((s, f) => s + f.weight, 0);
  assert.equal(Math.round(suma * 100), 1000, "10 kg impartit la 3 trebuie sa dea inapoi 10 kg");
});

test("⚠ restul cade pe ULTIMA parte, nu se pierde prin rotunjire", () => {
  /* `10/3` scris cu doua zecimale de trei ori da 9,99: un kilogram in minus la fiecare a suta
     expediere, si o taxare care nu se potriveste cu ce am cotat. */
  assert.deepEqual(impartireEgala(10, 3), [3.33, 3.33, 3.34]);
  assert.deepEqual(impartireEgala(1, 1), [1]);
  assert.deepEqual(impartireEgala(0.05, 2), [0.02, 0.03]);
  for (const [t, b] of [[7, 3], [0.1, 7], [123.45, 11]] as const) {
    const suma = impartireEgala(t, b).reduce((s, x) => s + x, 0);
    assert.equal(Math.round(suma * 100), Math.round(t * 100), `${t} in ${b} parti`);
  }
});

test("dimensiunile scrise de om se pastreaza pe toate bucatile", () => {
  const v = coleteleCargus({
    parcels: 2, envelopes: 0, totalWeightKg: 4,
    parcelsDetails: [{ weight: 4, length: 30, width: 20, height: 10 }],
  });
  assert.ok(v.ok);
  assert.equal(v.colete.fise.length, 2);
  assert.deepEqual(v.colete.fise.map((f) => f.length), [30, 30]);
});

test("fisele care CHIAR se potrivesc se iau ca atare, nu se rescriu", () => {
  const fise = [{ weight: 1.5 }, { weight: 2.5 }];
  const v = coleteleCargus({ parcels: 2, envelopes: 0, totalWeightKg: 4, parcelsDetails: fise });
  assert.ok(v.ok);
  assert.deepEqual(v.colete.fise, fise);
});

test("⚠ un numar de bucati care nu e numar se REFUZA, nu se corecteaza tacut", () => {
  for (const rau of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const v = coleteleCargus({ ...BAZA, parcels: rau });
    assert.equal(v.ok, false, `${rau} nu e un numar de colete`);
  }
});

test("⚠ plafoanele sunt ale LOR, si se refuza inainte de apel", () => {
  /* 9 plicuri: „Envelopes . number of envelopes. Maximum of 9" din documentatia lor.
     15 colete: anexa lor numeste „more than 15 pieces per shipment" ca limita a serviciului
     Multipiece, iar modulul lor taie la 15. */
  assert.equal(coleteleCargus({ parcels: 0, envelopes: MAX_PLICURI, totalWeightKg: 1, parcelsDetails: [] }).ok, true);
  assert.equal(coleteleCargus({ parcels: 0, envelopes: MAX_PLICURI + 1, totalWeightKg: 1, parcelsDetails: [] }).ok, false);
  assert.equal(coleteleCargus({ ...BAZA, parcels: MAX_COLETE, totalWeightKg: 15, parcelsDetails: [] }).ok, true);
  assert.equal(coleteleCargus({ ...BAZA, parcels: MAX_COLETE + 1, totalWeightKg: 16, parcelsDetails: [] }).ok, false);
});

test("⚠ un plic peste un kilogram se refuza, nu se taie tacut la 1", () => {
  /*
   * Inainte greutatea se TAIA (`Math.min(total, 1)`): omul scria 3 kg, pleca un AWB de 1 kg,
   * iar Cargus cantarea la depozit si factura diferenta. Acum i se spune.
   */
  const v = coleteleCargus({ parcels: 0, envelopes: 2, totalWeightKg: 3, parcelsDetails: [] });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.motiv.includes("maxim 1 kg"), v.ok ? "" : v.motiv);
});

test("⚠ o expediere e ori din plicuri, ori din colete, nu din amandoua", () => {
  /* `Parcels` si `Envelopes` sunt campuri separate la ei; trimise amandoua, tipul de pe
     `ParcelCodes` ar descrie doar jumatate din bucati. */
  const v = coleteleCargus({ parcels: 2, envelopes: 2, totalWeightKg: 1, parcelsDetails: [] });
  assert.equal(v.ok, false);
});

test("greutati si dimensiuni scrise gresit se refuza", () => {
  assert.equal(coleteleCargus({ ...BAZA, totalWeightKg: 0 }).ok, false);
  assert.equal(coleteleCargus({ ...BAZA, totalWeightKg: Number.NaN }).ok, false);
  assert.equal(coleteleCargus({ ...BAZA, parcelsDetails: [{ weight: 0 }] }).ok, false);
  assert.equal(coleteleCargus({ ...BAZA, parcelsDetails: [{ weight: -2 }] }).ok, false);
  assert.equal(coleteleCargus({ ...BAZA, parcelsDetails: [{ weight: 2, length: -1 }] }).ok, false);
});

/* ═══ MUTANTUL STA PE APELANT ═══ */
test("createCargusAwb chiar trece prin verificare, si cade INAINTE de apel", () => {
  const sursa = readFileSync(new URL("../cargus.ts", import.meta.url), "utf8");
  const start = sursa.indexOf("export async function createCargusAwb");
  const corp = sursa.slice(start, sursa.indexOf("\n}", start));

  assert.ok(corp.includes("coleteleCargus({"), "bucatile trebuie verificate");
  assert.ok(corp.includes("if (!verdictColete.ok) throw eroareRefuz"), "un corp incoerent se refuza");
  assert.ok(
    corp.includes("colete.fise.map("),
    "fisele trebuie sa vina din verificare, nu direct din ce a trimis fereastra",
  );
  assert.ok(
    !/input\.parcelsDetails\.map\(/.test(corp),
    "lista netrecuta prin verificare a fost chiar defectul",
  );
  assert.ok(
    corp.includes("Parcels: isEnvelope ? 0 : colete.bucati"),
    "numarul de bucati trebuie sa fie cel verificat",
  );
  /* Iar verificarea sta INAINTEA oricarui apel la ei: un refuz de dupa emitere ar fi un colet
     deja platit. `getCargusToken` e prima atingere a furnizorului. */
  assert.ok(
    corp.indexOf("coleteleCargus({") < corp.indexOf('cargusPost<unknown>("Awbs"'),
    "verificarea trebuie sa fie inaintea emiterii",
  );
});
