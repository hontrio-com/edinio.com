import { strict as assert } from "node:assert";
import { test } from "node:test";
import { poateIntraInCoada } from "./queue";

/*
 * Probele hotararii care lasa un produs sa intre in coada.
 *
 * ═══ DE CE E CEA MAI PERICULOASA DIN TOT FISIERUL ═══
 *
 * Gresita intr-un sens, nu se publica nimic — si asta chiar s-a intamplat: butonul
 * „Publică categoria" nu putea publica nimic la prima folosire, fiindca filtrul cerea
 * ca produsul sa aiba DEJA o oferta. Masurat pe un catalog de 1353 de produse: zero
 * puse la rand, si un mesaj de eroare care dadea vina pe alt comutator.
 *
 * Gresita in celalalt sens, se urca un catalog intreg pe eMAG dintr-o apasare care
 * promitea altceva. Iar eMAG NU sterge oferte — o oferta publicata se poate doar
 * retrage de la vanzare, si ramane pe veci in contul comerciantului.
 */

const GOL = new Set<string>();

test("coada: pe drumul OBISNUIT, un produs fara oferta NU intra", () => {
  /*
   * ⚠ Paza asta ramane, si e importanta: „sincronizează prețurile" n-are voie sa
   * PUBLICE produse pe care nimeni nu ceruse sa le publice. Fara ea, o apasare pe un
   * buton care promite o actualizare de pret ar fi urcat jumatate de catalog.
   */
  assert.equal(poateIntraInCoada("p1", GOL, GOL, false), false);
});

test("coada: pe drumul de PUBLICARE, un produs fara oferta intra", () => {
  /* Chiar defectul reparat: fara asta, prima publicare n-avea nicio cale. */
  assert.equal(poateIntraInCoada("p1", GOL, GOL, true), true);
});

test("coada: un produs cu oferta PORNITA intra pe amandoua drumurile", () => {
  const pornite = new Set(["p1"]);
  assert.equal(poateIntraInCoada("p1", pornite, GOL, false), true);
  assert.equal(poateIntraInCoada("p1", pornite, GOL, true), true);
});

test("coada: un produs cu oferta OPRITA nu intra NICIODATA", () => {
  /*
   * `auto_sync = false` inseamna „oferta asta e a comerciantului, preluata din contul
   * lui". O punere in masa n-are voie sa i-o rescrie — nici macar una care spune
   * „publică". Pretul de acolo si l-a pus el.
   */
  const oprite = new Set(["p1"]);
  assert.equal(poateIntraInCoada("p1", GOL, oprite, false), false);
  assert.equal(poateIntraInCoada("p1", GOL, oprite, true), false, "nici la publicare");
});

test("coada: ⚠ „OPRITA” BATE „PORNITA” cand produsul are amandoua felurile", () => {
  /*
   * ═══ CAZUL CARE SE SARE CEL MAI USOR ═══
   *
   * Un produs cu variante poate avea o parte din oferte preluate din contul lor si o
   * parte facute de noi — se intampla dupa un import partial, sau cand comerciantul a
   * adaugat o marime direct in panoul eMAG.
   *
   * Luat drept „pornit" fiindca MACAR UNA e pornita, o publicare in masa i-ar fi
   * rescris si ofertele preluate. Adica pretul pe care si l-a pus el in panoul lor,
   * suprascris de al nostru, fara sa ceara nimeni.
   *
   * Cand nu e limpede, se lasa in pace: exista „Trimite acum” pe produsul anume.
   */
  const pornite = new Set(["p1"]);
  const oprite = new Set(["p1"]);
  assert.equal(poateIntraInCoada("p1", pornite, oprite, false), false);
  assert.equal(poateIntraInCoada("p1", pornite, oprite, true), false);
});

test("coada: produsele se judeca unul cate unul, nu in bloc", () => {
  /* Un produs oprit nu are voie sa opreasca restul lotului, si nici invers. */
  const pornite = new Set(["a"]);
  const oprite = new Set(["b"]);
  const ids = ["a", "b", "c"];

  assert.deepEqual(
    ids.filter((id) => poateIntraInCoada(id, pornite, oprite, false)),
    ["a"],
    "drumul obisnuit: doar cel cu oferta pornita",
  );
  assert.deepEqual(
    ids.filter((id) => poateIntraInCoada(id, pornite, oprite, true)),
    ["a", "c"],
    "publicare: si cel fara nicio oferta, dar niciodata cel oprit",
  );
});
