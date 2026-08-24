import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { dupaRaspuns } from "./dupa-raspuns";

/* ══════════════════════════════════════════════════════════════════════════
   LUCRAREA DE DUPA RASPUNS (24.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ 84 DIN 97 DE PUNERI IN COADA ERAU `void`, SI NICAIERI UN `after`.

   Pe serverless, cand raspunsul pleaca, instanta poate fi inghetata. O promisiune
   neasteptata poate sa nu apuce sa-si termine scrierea catre baza: produsul ramane salvat
   in magazin si NIMIC nu intra in coada.

   ⚠ Iar defectul e tacut prin definitie — nu se scrie nicaieri ca n-a apucat sa se scrie.
   De aceea „zero erori in 30 de zile" NU e o dovada ca nu s-a intamplat, si nu se
   foloseste ca argument.
*/

test("lucrarea se executa si FARA context de cerere", async () => {
  /*
   * ═══ PLASA E PARTEA CEA MAI IMPORTANTA ═══
   *
   * `after` cere un context de cerere si ARUNCA fara el. Chemat dintr-un script, un test,
   * sau o cale ajunsa acolo altfel, o reparatie fara plasa ar pierde chiar lucrarile pe
   * care le apara — si inca zgomotos, in mijlocul salvarii unui produs.
   *
   * Proba asta ruleaza chiar in afara unei cereri, deci verifica exact ramura de rezerva.
   */
  let facut = false;
  dupaRaspuns(async () => { facut = true; }, "proba");

  /* ⚠ O microsarcina: `void` porneste promisiunea, dar n-o asteapta nimeni. */
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(facut, true, "lucrarea s-a pierdut cand `after` nu se poate folosi");
});

test("o lucrare care arunca NU rastoarna apelantul", async () => {
  /*
   * ⚠ Se cheama din mijlocul salvarii unui produs. O exceptie scapata de aici ar face ca
   * salvarea sa para picata, desi produsul e in baza — adica reparatia ar fi mai scumpa
   * decat defectul.
   */
  assert.doesNotThrow(() => {
    dupaRaspuns(async () => { throw new Error("dinadins"); }, "proba-cazuta");
  });
  await new Promise((r) => setTimeout(r, 10));
});

test("nu mai exista `void enqueue…` nicaieri in cod", () => {
  /*
   * ⚠ Proba pe intreg depozitul, nu pe un fisier: erau 84, in 22 de fisiere. Una singura
   * lasata pe urma inseamna o coada care se poate pierde tacut, si tocmai aia n-ar avea
   * niciun semn.
   */
  const gasite = execSync(
    'grep -rn "void enqueue" src/lib src/app --include=*.ts || true',
    { encoding: "utf8" },
  )
    .split(String.fromCharCode(10))
    .filter((l) => l.trim() !== "")
    /* ⚠ Cele doua fisiere ale reparatiei CITEAZA forma veche ca s-o explice — nota din
       ambalaj, si chiar numele probei asteia. A patra oara azi cand o verificare se
       potriveste cu propriul ei text; de aceea se exclud pe nume, nu prin ghicire. */
    .filter((l) => !l.startsWith("src/lib/marketplace/dupa-raspuns."));

  assert.deepEqual(gasite, [], "au ramas puneri in coada pornite si uitate");
});

test("ambalajul chiar foloseste `after`, nu doar `void`", () => {
  /* ⚠ Altfel proba de mai sus ar trece si cu un ambalaj care nu repara nimic. */
  const sursa = readFileSync("src/lib/marketplace/dupa-raspuns.ts", "utf8");
  assert.match(sursa, /from "next\/server"/, "trebuie sa vina din next/server");
  assert.match(sursa, /after\(cuPaza\)/, "si sa fie chemat");
  assert.match(sursa, /catch/, "cu plasa pentru cand nu exista context de cerere");
});
