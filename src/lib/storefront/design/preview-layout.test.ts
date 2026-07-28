import assert from "node:assert/strict";
import { test } from "node:test";
import { asezareMiniatura, LATIME_DESKTOP, LATIME_MOBIL } from "./preview-layout";

/**
 * Asezarea miniaturii nu are cum sa dea eroare cand greseste: pur si simplu
 * deseneaza magazinul altfel decat arata. De aceea are teste.
 *
 * Rulare: `npm test`.
 */

test("un card lat micsoreaza desktopul, unul ingust randeaza direct pe telefon", () => {
  const lat = asezareMiniatura({ latimeCard: 860, peMobil: false });
  assert.equal(lat.latimeRandare, LATIME_DESKTOP);
  assert.ok(lat.scara > 0.6 && lat.scara < 0.7);

  const ingust = asezareMiniatura({ latimeCard: 420, peMobil: false });
  assert.equal(ingust.latimeRandare, LATIME_MOBIL);
});

test("comutatorul „Pe telefon\" randeaza la latime de telefon oricat de lat ar fi cardul", () => {
  assert.equal(asezareMiniatura({ latimeCard: 860, peMobil: true }).latimeRandare, LATIME_MOBIL);
});

test("miniatura nu se mareste niciodata peste marimea reala", () => {
  // Cosul si formularul de comanda se randeaza fortat la 390. Intr-un card de
  // 860 raportul ar fi 2,2 — text de 14 px desenat la 31 px si carduri de peste
  // o mie de pixeli inaltime, adica exact pe dos fata de o miniatura.
  const { scara, latimeRandare } = asezareMiniatura({ latimeCard: 860, peMobil: false, latimeFixa: 390 });
  assert.equal(latimeRandare, 390);
  assert.equal(scara, 1);
});

test("cand nu umple cardul, miniatura sta la mijloc", () => {
  const { marginea } = asezareMiniatura({ latimeCard: 860, peMobil: false, latimeFixa: 390 });
  assert.equal(marginea, (860 - 390) / 2);

  // Cand umple cardul, nu ramane nimic de centrat.
  assert.equal(asezareMiniatura({ latimeCard: 860, peMobil: false }).marginea, 0);
});

test("latimea fixa are prioritate peste comutator, in ambele pozitii", () => {
  for (const peMobil of [true, false]) {
    assert.equal(asezareMiniatura({ latimeCard: 900, peMobil, latimeFixa: 390 }).latimeRandare, 390);
  }
});

test("inainte de prima masuratoare a cardului nu se randeaza nimic", () => {
  // `latimeCard` e 0 pana raspunde ResizeObserver; o scara de 0 tine iframe-ul
  // nemontat, in loc sa-l deseneze o data gresit si sa sara.
  assert.equal(asezareMiniatura({ latimeCard: 0, peMobil: false }).scara, 0);
});
