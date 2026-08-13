import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CARDURI_PERFORMANTA,
  CULORI_SCOR,
  PRAG_BUN,
  SCORURI_PAGESPEED,
  arcOprit,
  culoareScor,
  pasArc,
} from "./optimizare";

/*
 * Arcul care urcă cele patru scoruri nu se poate proba din browser:
 * `requestAnimationFrame` nu rulează într-o filă de fundal, iar
 * `IntersectionObserver` nici atât — deci bucla nici nu pornește. De aceea
 * integratorul stă ca funcție pură în `lib`, iar proba lui e aici.
 *
 * Ce păzește: că ajunge la valoare, că NU trece de ea, și că se oprește. Un arc
 * care depășește ar arăta o clipă un scor de 103 din 100 — adică un număr care nu
 * există; unul care nu se oprește ar ține o buclă de cadre pornită cât stă omul
 * pe pagină.
 */

/** Rulează arcul ca în componentă și întoarce drumul lui. */
function ruleaza(tinta: number, cadre = 400, dt = 1 / 60) {
  let x = 0;
  let viteza = 0;
  const drum: number[] = [];
  let cadrePanaLaOprire = -1;

  for (let i = 0; i < cadre; i++) {
    ({ x, viteza } = pasArc(x, viteza, tinta, dt));
    drum.push(x);
    if (cadrePanaLaOprire < 0 && arcOprit(x, viteza, tinta)) cadrePanaLaOprire = i + 1;
  }
  return { drum, final: x, maxim: Math.max(...drum), cadrePanaLaOprire };
}

test("arcul ajunge la scor, nu trece de el, și se oprește", () => {
  for (const { eticheta, scor } of SCORURI_PAGESPEED) {
    const r = ruleaza(scor);

    assert.ok(
      Math.abs(r.final - scor) < 0.05,
      `${eticheta}: s-a oprit la ${r.final.toFixed(2)}, nu la ${scor}`,
    );
    /* Supraamortizat: nu are voie sa treaca de valoare nici cu o zecime. */
    assert.ok(
      r.maxim <= scor + 0.01,
      `${eticheta}: a trecut de scor, pana la ${r.maxim.toFixed(2)}`,
    );
    assert.ok(r.cadrePanaLaOprire > 0, `${eticheta}: arcul nu s-a oprit niciodata`);
    /* Si nu tine bucla pornita minute intregi: sub doua secunde la 60 de cadre. */
    assert.ok(
      r.cadrePanaLaOprire < 120,
      `${eticheta}: s-a oprit abia dupa ${r.cadrePanaLaOprire} cadre`,
    );
  }
});

test("arcul rămâne stabil și la pasul cel mai mare îngăduit", () => {
  /*
    Componenta plafoneaza pasul la 1/30 de secunda. Un integrator explicit devine
    instabil cand `k · dt²` se apropie de 1 — aici e 100/900 = 0,11, deci e departe.
    Proba tine plafonul in loc: daca cineva il ridica la 1/10, numarul urca la 1,0
    si cadranul o ia razna in loc sa se opreasca.
  */
  const r = ruleaza(96, 400, 1 / 30);
  assert.ok(Math.abs(r.final - 96) < 0.05);
  assert.ok(r.maxim <= 96.01, `a sarit la ${r.maxim.toFixed(2)} la pasul mare`);
});

test("un pas de timp zero nu mișcă nimic", () => {
  /* `dt` se plafoneaza si in jos, la zero. Aici se vede de ce e inofensiv. */
  const r = pasArc(40, 12, 96, 0);
  assert.equal(r.x, 40);
  assert.equal(r.viteza, 12);
});

test("scorurile arătate sunt cele cerute: toate peste 90, deci toate verzi", () => {
  /*
    Clientul a cerut „toate peste 90". Proba tine cererea in loc si dupa ce cineva
    inlocuieste numerele cu o masuratoare adevarata — atunci ori masuratoarea da
    peste 90, ori se schimba afirmatia, nu se schimba proba.
  */
  for (const { eticheta, scor } of SCORURI_PAGESPEED) {
    assert.ok(scor > 90, `${eticheta}: ${scor}, sub pragul cerut`);
    assert.ok(scor <= 100, `${eticheta}: ${scor}, peste maximul uneltei`);
    assert.equal(culoareScor(scor), CULORI_SCOR.bun, `${eticheta} nu iese verde`);
  }
  assert.equal(SCORURI_PAGESPEED.length, 4, "unealta arata exact patru scoruri");
});

test("culoarea urmează pragurile uneltei, nu e scrisă de mână", () => {
  assert.equal(culoareScor(PRAG_BUN), CULORI_SCOR.bun);
  assert.equal(culoareScor(PRAG_BUN - 1), CULORI_SCOR.mediu);
  assert.equal(culoareScor(49), CULORI_SCOR.slab);
});

test("cardurile secțiunii au tot ce le trebuie", () => {
  const vazute = new Set<string>();
  for (const card of CARDURI_PERFORMANTA) {
    assert.equal(vazute.has(card.id), false, `${card.id} apare de două ori`);
    vazute.add(card.id);
    assert.ok(card.titlu.length > 0);
    assert.ok(card.descriere.length > 30, `${card.id}: descriere prea scurtă`);
  }
  /* ⚠ Clientul a cerut TREI carduri si a dat textele doar pentru primul. Cand vin
     celelalte doua, numarul de aici se ridica la 3 — pana atunci proba spune
     limpede unde a ramas lucrul. */
  assert.ok(
    CARDURI_PERFORMANTA.length >= 1 && CARDURI_PERFORMANTA.length <= 3,
    "secțiunea are între unu și trei carduri",
  );
});
