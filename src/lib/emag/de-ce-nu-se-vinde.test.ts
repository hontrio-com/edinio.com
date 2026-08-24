import { strict as assert } from "node:assert";
import { test } from "node:test";
import { deCeNuSeVinde, type StareaLaEmag } from "./de-ce-nu-se-vinde";

/*
 * ═══ O SINGURA ETICHETA PENTRU TOT ERA O MINCIUNE (24.08.2026) ═══
 *
 * Ecranul arata „Trimis, in validare" pentru 3.727 de oferte. Masurat in aceeasi zi:
 * 3.469 erau APROBATE de eMAG de mult, iar cele verificate in raspunsul lor brut aveau
 * `status: 2` — scoase din vanzare.
 *
 * Eticheta il trimitea pe om sa astepte o validare incheiata, in loc sa se uite la ce
 * chiar lipseste. Planul integrarii cere chiar opusul: „panoul trebuie sa spuna
 * adevarul asta intreg, nu «trimis»".
 */

const BAZA: StareaLaEmag = {
  validation_status: 9, offer_validation_status: 1,
  status_la_ei: 1, stoc_la_ei: 5, doc_errors: [],
};

test("de ce nu se vinde: totul in regula inseamna chiar ca se vinde", () => {
  const r = deCeNuSeVinde(BAZA);
  assert.equal(r.seVinde, true);
  assert.match(r.eticheta, /vinde/i);
});

test("de ce nu se vinde: aprobata dar SCOASA la ei — cazul care statea ascuns", () => {
  /* ⚠ Chiar cazul din 24.08: aprobata de eMAG, dar `status: 2` = End of Life. Ecranul
     spunea „in validare" pentru asta. */
  const r = deCeNuSeVinde({ ...BAZA, status_la_ei: 2 });
  assert.equal(r.seVinde, false);
  assert.match(r.eticheta, /scoas/i);
  assert.match(r.indrumare, /panoul/i, "trebuie sa spuna UNDE se reporneste");
});

test("de ce nu se vinde: respinsa se spune PRIMA, chiar daca lipseste si stocul", () => {
  /*
   * ⚠ Ordinea conteaza. N-are rost sa-i spui cuiva „n-are stoc" despre un produs pe care
   * eMAG l-a respins oricum: ar repara stocul si tot n-ar vinde nimic.
   */
  const r = deCeNuSeVinde({ ...BAZA, validation_status: 8, stoc_la_ei: 0, status_la_ei: 0 });
  assert.match(r.eticheta, /respins/i);
});

test("de ce nu se vinde: la respingere se spune UNDE e motivul", () => {
  /*
   * ⚠ Verificat pe date reale: eMAG NU trimite motivul prin `product_offer/read`. Zero
   * din cele cercetate aveau `doc_errors`. Lasat gol, randul arata ca o respingere fara
   * cauza, iar omul cauta la noi ceva ce e numai la ei.
   */
  const fara = deCeNuSeVinde({ ...BAZA, validation_status: 8 });
  assert.match(fara.indrumare, /panoul lor/i);

  const cu = deCeNuSeVinde({ ...BAZA, validation_status: 8, doc_errors: ["Lipseste marca"] });
  assert.equal(cu.indrumare, "Lipseste marca", "cand spun ei ceva, se arata ce spun ei");
});

test("de ce nu se vinde: necitit NU se arata ca „se vinde”", () => {
  /*
   * ⚠ `null` inseamna „n-am intrebat inca", nu „e in regula". Confundate, un rand necitit
   * ar fi aratat verde, iar omul ar fi crezut ca se vinde ceva ce poate nici nu exista.
   */
  for (const necitit of [{ status_la_ei: null }, { stoc_la_ei: null }]) {
    const r = deCeNuSeVinde({ ...BAZA, ...necitit });
    assert.equal(r.seVinde, false, JSON.stringify(necitit));
    assert.match(r.eticheta, /necitit/i);
  }
});

test("de ce nu se vinde: fiecare lipsa are eticheta ei, nu una singura", () => {
  /* ⚠ Miezul reparatiei: cinci motive diferite, cinci mesaje diferite. */
  const etichete = new Set([
    deCeNuSeVinde({ ...BAZA, validation_status: 8 }).eticheta,
    deCeNuSeVinde({ ...BAZA, validation_status: 4 }).eticheta,
    deCeNuSeVinde({ ...BAZA, status_la_ei: 2 }).eticheta,
    deCeNuSeVinde({ ...BAZA, status_la_ei: 0 }).eticheta,
    deCeNuSeVinde({ ...BAZA, offer_validation_status: 2 }).eticheta,
    deCeNuSeVinde({ ...BAZA, stoc_la_ei: 0 }).eticheta,
  ]);
  assert.equal(etichete.size, 6, `s-au repetat etichete: ${[...etichete].join(" | ")}`);
});
