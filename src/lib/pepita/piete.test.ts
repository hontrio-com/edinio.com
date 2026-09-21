import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ORDINEA_PIETELOR, PIETE, type PiataPepita } from "./types";
import { aceeasiMoneda, opreste, pretulPietei, scrieCursul, zecimale } from "./piete";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠⚠ Feedul scrie moneda PIETEI, iar pretul vine din catalogul magazinului.
  Trimise asa cum sunt, un produs de 500 RON pleaca spre Ungaria ca
  `<Price>500</Price><Currency>HUF</Currency>` - vandut la ~1% din pret.

  XML-ul e valid, feedul raspunde 200, panoul arata verde. Nu da nicio eroare
  nicaieri: se afla din comenzi.

  Acelasi defect a existat la AboutYou (26.08.2026), unde 20 EUR se citea ca
  20 PLN in Polonia.
*/

const RO_ACTIV = { activa: true, curs: null };

test("⚠ FARA CURS SCRIS, PIATA CU ALTA MONEDA NU TRIMITE NIMIC", () => {
  /*
    ⚠ Nu „trimite fara conversie", nu „trimite un feed gol": NU TRIMITE. Tacerea
    e singurul raspuns cinstit cand nu stim pretul.
  */
  const r = opreste("hu", { activa: true, curs: null }, "RON");
  assert.equal(r?.cheie, "fara-curs");
  assert.match(r!.text, /HUF/);
  assert.match(r!.text, /nu pleacă/);

  /* Si pretul nu se poate socoti deloc. */
  assert.equal(pretulPietei(500, "hu", { activa: true, curs: null }, "RON"), null);
});

test("⚠ ACELASI NUMAR NU PLEACA CU ALTA MONEDA PE EL", () => {
  /*
    ⚠ Proba care apara chiar defectul: 500 de lei catre Ungaria nu au voie sa
    iasa ca 500. Cu cursul scris, ies 39.500.
  */
  const cuCurs = { activa: true, curs: 79 };
  const iesit = pretulPietei(500, "hu", cuCurs, "RON");
  assert.notEqual(iesit, 500, "pretul a plecat NECONVERTIT, cu alta moneda pe el");
  assert.equal(iesit, 39500);
});

test("piata cu aceeasi moneda nu cere niciun curs", () => {
  assert.equal(opreste("ro", { activa: true, curs: null }, "RON"), null);
  assert.equal(pretulPietei(123.45, "ro", { activa: true, curs: null }, "RON"), 123.45);

  /* ⚠ Si un magazin in EUR poate trimite catre Germania fara curs. */
  assert.equal(opreste("de", { activa: true, curs: null }, "EUR"), null);
  assert.equal(pretulPietei(20, "de", { activa: true, curs: null }, "EUR"), 20);
});

test("⚠ MONEDA MAGAZINULUI NU SE PRESUPUNE A FI RON", () => {
  /*
    ⚠ Scrisa de-a gata, un magazin in EUR ar fi fost pus sa scrie un curs
    EUR→EUR pentru Germania, iar pentru Romania n-ar fi cerut niciunul - exact
    pe dos.
  */
  assert.equal(aceeasiMoneda("de", "EUR"), true);
  assert.equal(aceeasiMoneda("de", "RON"), false);
  assert.equal(opreste("ro", { activa: true, curs: null }, "EUR")?.cheie, "fara-curs");
  assert.equal(aceeasiMoneda("ro", " ron "), true, "spatiile si literele mici nu schimba moneda");
});

test("o piata nepornita nu trimite, oricat curs ar avea", () => {
  assert.equal(opreste("hu", { activa: false, curs: 79 }, "RON")?.cheie, "neactivata");
  assert.equal(opreste("hu", undefined, "RON")?.cheie, "neactivata");
  assert.equal(pretulPietei(500, "hu", { activa: false, curs: 79 }, "RON"), null);
});

test("⚠ UN CURS NEVALID E DEOSEBIT DE UNUL NESCRIS", () => {
  /*
    ⚠ „N-am scris inca" si „am scris o prostie" cer doua raspunsuri: primul e o
    treaba neterminata, al doilea o greseala. Acelasi mesaj l-ar fi pus pe om sa
    caute un camp gol care nu e gol.
  */
  for (const rau of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = opreste("pl", { activa: true, curs: rau }, "RON");
    assert.equal(r?.cheie, "curs-nevalid", `cursul ${rau} ar fi trebuit respins`);
  }
  assert.equal(opreste("pl", { activa: true, curs: null }, "RON")?.cheie, "fara-curs");
});

test("⚠ UN PRET CARE IESE ZERO DUPA CONVERSIE NU PLEACA", () => {
  /*
    ⚠ Se intampla la monede „mari": un produs de 0,30 lei catre euro da 0,06,
    iar cu un curs scris gresit da zero curat. Pepita respinge zero fara sa
    spuna de ce, deci se opreste aici, unde se poate arata langa produs.
  */
  assert.equal(pretulPietei(0.3, "de", { activa: true, curs: 0.0001 }, "RON"), null);
  assert.equal(pretulPietei(0.3, "de", { activa: true, curs: 0.2 }, "RON"), 0.06);
});

test("⚠ CELE SAPTE PIETE AU ADRESE CARE CHIAR SUNT ALE LOR", () => {
  /*
    ⚠ Verificat pe 21.09.2026 cerand fiecare adresa: `pepita.pl` e un magazin
    POLONEZ DE GENTI DE PIELE (alta firma), iar `pepita.sk` e un domeniu PARCAT
    la un hosting. Amandoua raspund 200 si au „Pepita" in titlu. `pepita.ro` nu
    raspunde deloc - defectul din 09.09.2026.

    Marketplace-ul sta pe `pepita.hu` si pe `pepita.com/{tara}`, si atat.
  */
  for (const [cheie, p] of Object.entries(PIETE)) {
    const potrivita = p.adresa === "pepita.hu" || p.adresa === `pepita.com/${cheie}`;
    assert.ok(potrivita, `${cheie}: adresa „${p.adresa}" nu e a marketplace-ului`);
    assert.doesNotMatch(p.adresa, /^pepita\.(ro|pl|sk|de|bg|hr)$/, `${cheie}: domeniu de tara care nu e al lor`);
    assert.match(p.moneda, /^[A-Z]{3}$/, `${cheie}: moneda nu e cod ISO 4217`);
  }
});

test("monedele sunt cele declarate de ei, nu cele din memoria mea", () => {
  /*
    ⚠ Bulgaria da EUR, nu BGN, si Croatia la fel: amandoua au trecut la euro.
    O lista scrisa din cap ar fi ramas in urma, iar preturile ar fi plecat cu
    moneda gresita - adica exact defectul pe care il pazim.
  */
  assert.equal(PIETE.hu.moneda, "HUF");
  assert.equal(PIETE.ro.moneda, "RON");
  assert.equal(PIETE.pl.moneda, "PLN");
  for (const t of ["sk", "de", "bg", "hr"] as const) {
    assert.equal(PIETE[t].moneda, "EUR", `${t} ar trebui sa fie pe euro`);
  }
});

test("toate pietele sunt in ordinea de pe ecran, si niciuna de doua ori", () => {
  const toate = Object.keys(PIETE) as PiataPepita[];
  assert.equal(ORDINEA_PIETELOR.length, toate.length, "ordinea de pe ecran a ramas in urma");
  assert.deepEqual([...ORDINEA_PIETELOR].sort(), [...toate].sort());
  assert.equal(new Set(ORDINEA_PIETELOR).size, ORDINEA_PIETELOR.length);
  assert.equal(ORDINEA_PIETELOR[0], "ro", "Romania sta prima: de acolo am pornit");
});

test("forintul se scrie fara zecimale", () => {
  /* ⚠ Forintul nu se imparte in subunitati folosite: „39.500,00 Ft" arata strain. */
  assert.equal(zecimale("hu"), 0);
  assert.equal(zecimale("ro"), 2);
  assert.equal(zecimale("de"), 2);
});

test("cursul se scrie pe intelesul omului", () => {
  assert.equal(scrieCursul("hu", 79, "RON"), "1 RON = 79 HUF");
  assert.equal(scrieCursul("hu", null, "RON"), "1 RON = ? HUF");
  assert.match(scrieCursul("ro", null, "RON"), /Aceeași monedă/);
});
