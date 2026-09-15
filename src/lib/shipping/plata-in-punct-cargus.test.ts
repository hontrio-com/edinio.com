import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { punctulPoateIncasa, PLATA_IN_PUNCT } from "./plata-in-punct-cargus";

const punct = (serviceCod: boolean, paymentType?: number | null) => ({ serviceCod, paymentType });

test("⚠⚠ un punct care primeste ramburs NUMAI PE CARD nu mai trece la ramburs in numerar", () => {
  /*
   * ASTA E DEFECTUL. Se cerea doar `ServiceCOD`. Un punct cu `PaymentType: 2` il are, dar la
   * ghiseu se plateste numai cu cardul: coletul pleca acolo cu `CashRepayment`, iar
   * cumparatorul ajunge cu banii in mana si nicio cale sa-i dea. Coletul se intoarce.
   */
  const doarCard = punct(true, PLATA_IN_PUNCT.DOAR_CARD);
  assert.equal(punctulPoateIncasa(doarCard, 250, "cash"), false);
  /* Dar pentru un comerciant care isi ia rambursul in cont, plata la ghiseu E cu cardul. */
  assert.equal(punctulPoateIncasa(doarCard, 250, "bank"), true);
});

test("⚠ si pe dos: un punct DOAR NUMERAR nu poate incasa un ramburs bancar", () => {
  const doarNumerar = punct(true, PLATA_IN_PUNCT.DOAR_NUMERAR);
  assert.equal(punctulPoateIncasa(doarNumerar, 250, "cash"), true);
  assert.equal(punctulPoateIncasa(doarNumerar, 250, "bank"), false);
});

test("punctul care primeste si numerar, si card, e bun pentru amandoua formele", () => {
  const amandoua = punct(true, PLATA_IN_PUNCT.NUMERAR_SAU_CARD);
  assert.equal(punctulPoateIncasa(amandoua, 250, "cash"), true);
  assert.equal(punctulPoateIncasa(amandoua, 250, "bank"), true);
});

test("⚠ `PaymentType: 1` nu incaseaza nimic, oricat ar spune `ServiceCOD`", () => {
  const nimic = punct(true, PLATA_IN_PUNCT.NICIUNA);
  assert.equal(punctulPoateIncasa(nimic, 250, "cash"), false);
  assert.equal(punctulPoateIncasa(nimic, 250, "bank"), false);
});

test("fara ramburs, intrebarea nu se pune: orice punct e bun", () => {
  assert.equal(punctulPoateIncasa(punct(false, PLATA_IN_PUNCT.NICIUNA), 0, "cash"), true);
  assert.equal(punctulPoateIncasa(punct(false, null), 0, "bank"), true);
  /* Si o suma care nu e o suma se poarta la fel ca zero. */
  assert.equal(punctulPoateIncasa(punct(false, null), Number.NaN, "cash"), true);
  assert.equal(punctulPoateIncasa(punct(false, null), -5, "cash"), true);
});

test("un punct fara `ServiceCOD` nu primeste ramburs deloc", () => {
  assert.equal(punctulPoateIncasa(punct(false, PLATA_IN_PUNCT.NUMERAR_SAU_CARD), 250, "cash"), false);
});

test("⚠⚠ cand `PaymentType` LIPSESTE, punctul RAMANE in lista", () => {
  /*
   * Campul e optional in raspunsul lor. Scos din lista pentru lipsa lui, un cont care nu-l
   * trimite ar ramane BRUSC fara niciun punct Ship & Go, iar o lista goala nu produce niciun
   * mesaj in interfata: defectul ar fi tacut si ar arata ca „nu mai merge nimic".
   *
   * Deci prudenta aici e sa PASTREZI, nu sa tai. E chiar purtarea de pana acum.
   */
  assert.equal(punctulPoateIncasa(punct(true, null), 250, "cash"), true);
  assert.equal(punctulPoateIncasa(punct(true, undefined), 250, "bank"), true);
  assert.equal(punctulPoateIncasa(punct(true, Number.NaN), 250, "cash"), true);
});

test("⚠ un `PaymentType` pe care nu-l stim PASTREAZA punctul, ca si lipsa campului", () => {
  /*
   * Ei pot adauga maine o valoare noua. Taiata, un cont intreg ar ramane peste noapte fara
   * niciun punct Ship & Go, iar o lista goala nu produce niciun mesaj in interfata: defect
   * tacit si total. Un colet trimis la un ghiseu care nu incaseaza e vizibil si rar. Intre
   * cele doua, se alege cel vizibil.
   */
  assert.equal(punctulPoateIncasa(punct(true, 7), 250, "cash"), true);
  assert.equal(punctulPoateIncasa(punct(true, 99), 250, "bank"), true);
});

/* ═══ MUTANTUL STA PE APELANT ═══ */
test("⚠ lista de puncte din checkout chiar foloseste regula, cu forma rambursului", () => {
  const sursa = readFileSync(
    new URL("../actions/shipping.actions.ts", import.meta.url), "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(sursa, /punctulPoateIncasa\(p, codAmount \?\? 0, formaRambursului\)/,
    "filtrul trebuie sa treaca prin regula, nu prin `p.serviceCod` gol");
  assert.match(sursa, /const formaRambursului = config\.repayment_type === "bank" \? "bank" : "cash";/,
    "forma rambursului se ia din configul magazinului");
  assert.ok(
    !/points\.filter\(\(p\) => p\.serviceCod\)/.test(sursa),
    "filtrul doar pe `serviceCod` a fost chiar defectul",
  );
});

test("⚠ si clientul chiar citeste `PaymentType` din raspunsul lor", () => {
  /* Regula poate fi perfecta si oarba: fara campul citit, `paymentType` ar fi mereu `null`
     si fiecare punct ar trece pe ramura prudenta. */
  const client = readFileSync(new URL("../cargus.ts", import.meta.url), "utf8");
  assert.match(client, /paymentType: typeof p\.PaymentType === "number" \? p\.PaymentType : null/);
});
