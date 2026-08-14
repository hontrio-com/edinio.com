import assert from "node:assert/strict";
import { test } from "node:test";
import { conditionsMatch, parseShippingRules } from "./rules";

/**
 * O conditie necitibila nu are voie sa faca regula UNIVERSALA.
 *
 * `conditions: []` inseamna „se potriveste mereu", si asa trebuie sa ramana
 * pentru o regula scrisa ANUME fara conditii. Dar o regula care AVEA o conditie
 * si a pierdut-o la parsare ajungea in acelasi loc — deci se aplica la toate
 * comenzile. Pe o actiune `free`, asta inseamna transport gratuit pe orice cos.
 */

const cos = {
  subtotal: 20,
  weightKg: 1,
  quantity: 1,
  classIds: [] as string[],
  categories: [] as string[],
  productIds: [] as string[],
  county: "Cluj",
};

test("⚠ o conditie golita din panou STINGE regula, nu o face universala", () => {
  /*
   * Drumul real: „Transport gratuit peste 200 lei" e `{type:"subtotal", min:200}`.
   * Comerciantul sterge cifra ca sa scrie alta, casuta goala trimite
   * `min: undefined`, iar conditia devine necitibila. Pana la reparatie regula
   * ramanea aprinsa si fara conditii — adica transport gratuit la un cos de 20 lei.
   */
  const [regula] = parseShippingRules([
    {
      id: "r1", name: "Transport gratuit peste 200 lei", enabled: true,
      conditions: [{ type: "subtotal", min: undefined, max: undefined }],
      action: { type: "free" },
    },
  ]);

  assert.ok(regula, "regula trebuie sa ramana vizibila, ca sa poata fi reparata");
  assert.equal(regula.enabled, false, "o conditie pierduta trebuie sa stinga regula");
  /* Si daca cineva o citeste fara sa se uite la `enabled`, sa se vada de ce conteaza: */
  assert.equal(conditionsMatch(regula.conditions, cos), true,
    "fara conditii chiar se potriveste la orice — de asta stingerea e singura aparare");
});

test("o regula scrisa ANUME fara conditii ramane aprinsa", () => {
  const [regula] = parseShippingRules([
    { id: "r2", name: "Peste tot", enabled: true, conditions: [], action: { type: "free" } },
  ]);
  assert.equal(regula.enabled, true);
  assert.deepEqual(regula.conditions, []);
});

test("o regula fara cheia `conditions` ramane aprinsa", () => {
  const [regula] = parseShippingRules([
    { id: "r3", name: "Fara cheie", enabled: true, action: { type: "free" } },
  ]);
  assert.equal(regula.enabled, true);
});

test("cand se pierde DOAR una din doua conditii, regula tot se stinge", () => {
  /*
   * Altfel ar ramane aprinsa cu o conditie mai LARGA decat a cerut comerciantul —
   * „peste 200 lei SI sub 10 kg" ar deveni doar „sub 10 kg".
   */
  const [regula] = parseShippingRules([
    {
      id: "r4", name: "Doua conditii", enabled: true,
      conditions: [
        { type: "subtotal", min: undefined },
        { type: "weight", max: 10 },
      ],
      action: { type: "free" },
    },
  ]);
  assert.equal(regula.enabled, false);
  assert.equal(regula.conditions.length, 1, "conditia citibila se pastreaza, ca sa se vada ce a ramas");
});

test("o regula deja stinsa ramane stinsa", () => {
  const [regula] = parseShippingRules([
    { id: "r5", name: "Stinsa", enabled: false, conditions: [{ type: "subtotal", min: 200 }], action: { type: "free" } },
  ]);
  assert.equal(regula.enabled, false);
});

test("o regula intreaga trece neatinsa", () => {
  const [regula] = parseShippingRules([
    {
      id: "r6", name: "Peste 200 lei", enabled: true,
      conditions: [{ type: "subtotal", min: 200 }],
      action: { type: "free" },
    },
  ]);
  assert.equal(regula.enabled, true);
  assert.equal(regula.conditions.length, 1);
  assert.equal(conditionsMatch(regula.conditions, cos), false, "cos de 20 lei nu trece de pragul de 200");
  assert.equal(conditionsMatch(regula.conditions, { ...cos, subtotal: 250 }), true);
});
