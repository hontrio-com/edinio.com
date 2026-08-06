import { strict as assert } from "node:assert";
import { test } from "node:test";
import { liniiRand, randUrmator } from "./feature-rand";

/*
 * Probele astea exista dintr-un motiv anume: partea de telefon a teancului nu
 * poate fi privita in browserul sesiunii — fara `requestAnimationFrame` si fara
 * `IntersectionObserver`, ascultatorul nu porneste niciodata. Decizia e scoasa
 * intr-o functie pura tocmai ca sa poata fi verificata aici, cu numere reale de
 * telefon.
 */

const ANTET = 73;
const SUS = 0.48;
const JOS = 0.62;

/** Un iPhone 14: 844px inaltime, carduri de ~839px, distanta 32px. */
const H_CARD = 839;
const PAS = H_CARD + 32;

function linii(fereastra: number) {
  return liniiRand(fereastra, ANTET, SUS, JOS);
}

/** Varfurile celor cinci locasuri cand pagina e derulata cu `y` de la sectiune. */
function varfuri(y: number, n = 5): number[] {
  return Array.from({ length: n }, (_, i) => i * PAS - y);
}

test("liniile stau in banda libera, nu la procente din fereastra", () => {
  const { lineUp, lineDown } = linii(844);
  /* Sub antet, si destul de sus cat sa nu cada in spatele butoanelor plutitoare
     (`StickyContact` ocupa de la 24 la ~130px de baza) sau al barei browserului. */
  assert.ok(lineUp > ANTET, `lineUp ${lineUp} trebuie sub antet`);
  assert.ok(lineDown < 844 - 130, `lineDown ${lineDown} intra peste butoane`);
  assert.ok(lineDown > lineUp, "linia de stingere trebuie sub cea de aprindere");
});

test("histereza ramane larga pe cel mai mic telefon", () => {
  for (const fereastra of [667, 800, 844, 915]) {
    const { lineUp, lineDown } = linii(fereastra);
    assert.ok(
      lineDown - lineUp >= 60,
      `pe ${fereastra}px histereza e doar ${(lineDown - lineUp).toFixed(0)}px`,
    );
  }
});

test("inainte de sectiune nu e nimeni la rand", () => {
  const { lineUp, lineDown } = linii(844);
  /* Sectiunea inca sub ecran: toate varfurile sub linia de aprindere. */
  assert.equal(randUrmator(varfuri(-900), -1, lineUp, lineDown), -1);
});

test("primul card se aprinde exact cand ii trece varful de linie", () => {
  const { lineUp, lineDown } = linii(844);
  /* Varful cu un pixel SUB linie: inca nimeni. */
  assert.equal(randUrmator(varfuri(-lineUp - 1), -1, lineUp, lineDown), -1);
  /* Varful fix pe linie: se aprinde. */
  assert.equal(randUrmator(varfuri(-lineUp), -1, lineUp, lineDown), 0);
});

test("cardurile se aprind pe rand la derulare in jos", () => {
  const { lineUp, lineDown } = linii(844);
  let activ = -1;
  const vazute: number[] = [];
  for (let y = 0; y <= PAS * 5; y += 10) {
    const nou = randUrmator(varfuri(y), activ, lineUp, lineDown);
    if (nou !== activ) vazute.push(nou);
    activ = nou;
  }
  assert.deepEqual(vazute, [0, 1, 2, 3, 4], "trebuie sa treaca prin toate, in ordine");
});

test("derularea inapoi le stinge in ordine inversa, fara sarituri", () => {
  const { lineUp, lineDown } = linii(844);
  let activ = 4;
  const vazute: number[] = [];
  /* Pana bine deasupra sectiunii: primul card ramane la rand cat timp varful lui
     e inca peste linia de stingere, deci trebuie coborat sub ea ca sa se stinga. */
  for (let y = PAS * 5; y >= -900; y -= 10) {
    const nou = randUrmator(varfuri(y), activ, lineUp, lineDown);
    if (nou !== activ) vazute.push(nou);
    activ = nou;
  }
  assert.deepEqual(vazute, [3, 2, 1, 0, -1]);
});

test("primul card ramane la rand cat sectiunea e sub antet", () => {
  const { lineUp, lineDown } = linii(844);
  /* Sectiunea abia inceputa: varful primului card fix sub antet. Nu are rost sa
     fie nimeni „inainte de primul" cat primul card umple ecranul. */
  assert.equal(randUrmator(varfuri(0), 0, lineUp, lineDown), 0);
  /* Abia cand e impins in jos, sub linia de stingere, nu mai e nimeni. */
  assert.equal(randUrmator(varfuri(-700), 0, lineUp, lineDown), -1);
});

test("tremuratul degetului pe linie NU schimba starea", () => {
  const { lineUp, lineDown } = linii(844);
  /* Pozitia exacta la care cardul 1 tocmai s-a aprins. */
  let y = 0;
  let activ = -1;
  while (randUrmator(varfuri(y), activ, lineUp, lineDown) < 1) {
    activ = randUrmator(varfuri(y), activ, lineUp, lineDown);
    y += 1;
  }
  activ = 1;

  /* Acum tremura +-3px de 40 de ori. Nimic nu are voie sa se schimbe. */
  for (let i = 0; i < 40; i++) {
    const dy = (i % 2 === 0 ? 3 : -3) + (i % 3) - 1;
    const nou = randUrmator(varfuri(y + dy), activ, lineUp, lineDown);
    assert.equal(nou, 1, `la ${dy}px de linie starea a sarit la ${nou}`);
  }
});

test("o derulare cu inertie care sare peste doua carduri intr-un cadru le prinde pe toate", () => {
  const { lineUp, lineDown } = linii(844);
  /* Dintr-un singur cadru: de dinainte de sectiune direct la al treilea card. */
  const activ = randUrmator(varfuri(PAS * 3), -1, lineUp, lineDown);
  assert.equal(activ, 3, "cu `if` in loc de bucla ar fi ramas la 0");
});

test("intoarcerea brusca din inertie, tot intr-un cadru, coboara pana la capat", () => {
  const { lineUp, lineDown } = linii(844);
  /* De la ultimul card direct deasupra sectiunii, fara pasi intermediari. */
  assert.equal(randUrmator(varfuri(-700), 4, lineUp, lineDown), -1);
  /* Si o intoarcere partiala: de la ultimul la al doilea, tot intr-un cadru. */
  assert.equal(randUrmator(varfuri(PAS * 1), 4, lineUp, lineDown), 1);
});

test("exact un card e la rand, oriunde in sectiune, pe orice telefon", () => {
  for (const fereastra of [667, 800, 844, 915]) {
    const { lineUp, lineDown } = linii(fereastra);
    let activ = -1;
    for (let y = 0; y <= PAS * 4 + 400; y += 7) {
      activ = randUrmator(varfuri(y), activ, lineUp, lineDown);
      assert.ok(
        activ >= -1 && activ < 5,
        `pe ${fereastra}px, la y=${y}, indice invalid ${activ}`,
      );
    }
    assert.equal(activ, 4, `pe ${fereastra}px ultimul card ramane la rand`);
  }
});

test("un card mai inalt decat fereastra tot trece prin toate starile", () => {
  /* iPhone SE: fereastra 667, cardul 828 — mai inalt decat ecranul. */
  const { lineUp, lineDown } = liniiRand(667, ANTET, SUS, JOS);
  const pas = 828 + 32;
  const varf = (y: number) => Array.from({ length: 5 }, (_, i) => i * pas - y);
  let activ = -1;
  const vazute: number[] = [];
  for (let y = 0; y <= pas * 5; y += 10) {
    const nou = randUrmator(varf(y), activ, lineUp, lineDown);
    if (nou !== activ) vazute.push(nou);
    activ = nou;
  }
  assert.deepEqual(vazute, [0, 1, 2, 3, 4]);
});

test("cu un singur card nu se intampla nimic ciudat", () => {
  const { lineUp, lineDown } = linii(844);
  assert.equal(randUrmator([1000], -1, lineUp, lineDown), -1);
  assert.equal(randUrmator([0], -1, lineUp, lineDown), 0);
});
