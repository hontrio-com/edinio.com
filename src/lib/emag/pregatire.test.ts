import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ceLipseste, numarImagini, scorPregatire, sePoatePublica,
  type CerinteCategorie, type CerinteMagazin, type ProdusDeVerificat,
} from "./pregatire";

/*
 * Probele verificarii locale.
 *
 * Fiecare produs trimis incomplet costa de patru ori: o cerere din cele 3 pe secunda,
 * o incercare din coada, o eroare pe care omul o vede peste ore, si un panou care
 * arata „trimis" fara sa fie adevarul care il intereseaza. Probele de aici pazesc
 * tocmai raspunsul care le scuteste pe toate.
 */

const PRODUS_BUN: ProdusDeVerificat = {
  name: "Tricou bumbac",
  price: 99.9,
  sku: "TR-001",
  category: "Tricouri",
  images: ["https://x/1.jpg", "https://x/2.jpg"],
  weight_grams: 180,
  description: "<p>Bumbac 100%</p>",
  gtin: "5941234567890",
  brand: "Marca",
  dimensiuni: { length: 30, width: 20, height: 3 },
};

const CATEGORIE_BUNA: CerinteCategorie = {
  category_id: 506,
  eanObligatoriu: true,
  garantieObligatorie: false,
  obligatorii: [{ id: 6553, nume: "Mărime" }],
  completate: [{ id: 6553, value: "M" }],
  areTipFamilie: true,
};

const MAGAZIN_BUN: CerinteMagazin = {
  vat_id: 1,
  handling_time: 1,
  warranty_default: 24,
  areGpsr: true,
};

/* ── Cazul curat ───────────────────────────────────────────────────────────── */

test("eMAG pregatire: un produs complet n-are nicio lipsa", () => {
  const l = ceLipseste(PRODUS_BUN, CATEGORIE_BUNA, MAGAZIN_BUN, false);
  assert.deepEqual(l, [], `au aparut lipsuri: ${l.map((x) => x.camp).join(", ")}`);
  assert.equal(sePoatePublica(l), true);
  assert.equal(scorPregatire(l), 100);
});

/* ── Ce opreste trimiterea ─────────────────────────────────────────────────── */

test("eMAG pregatire: fara categorie legata, produsul nu poate pleca", () => {
  const l = ceLipseste(PRODUS_BUN, null, MAGAZIN_BUN, false);
  assert.equal(sePoatePublica(l), false);
  assert.ok(l.some((x) => x.camp === "categorie"));
  assert.match(l.find((x) => x.camp === "categorie")!.eticheta, /Tricouri/,
    "mesajul spune CARE categorie, nu doar ca lipseste una");
});

test("eMAG pregatire: EAN cerut de categorie si lipsa din produs", () => {
  const l = ceLipseste({ ...PRODUS_BUN, gtin: null }, CATEGORIE_BUNA, MAGAZIN_BUN, false);
  assert.equal(sePoatePublica(l), false);
  assert.ok(l.some((x) => x.camp === "ean"));
});

test("eMAG pregatire: EAN NECERUT de categorie nu opreste nimic", () => {
  /* ⚠ Obligativitatea vine din categoria LOR, nu dintr-o regula a noastra. Aplicata
     peste tot, ar fi oprit produse pe care eMAG le primeste fara cod. */
  const l = ceLipseste(
    { ...PRODUS_BUN, gtin: null },
    { ...CATEGORIE_BUNA, eanObligatoriu: false },
    MAGAZIN_BUN, false,
  );
  assert.equal(sePoatePublica(l), true);
});

test("eMAG pregatire: caracteristica obligatorie necompletata la mapare", () => {
  /*
   * Lipsa lor respinge FIECARE produs din categoria aceea, iar mesajul lui eMAG
   * vorbeste despre produs, nu despre mapare — omul l-ar fi cautat in datele
   * produsului.
   */
  const l = ceLipseste(PRODUS_BUN, { ...CATEGORIE_BUNA, completate: [] }, MAGAZIN_BUN, false);
  assert.equal(sePoatePublica(l), false);
  const c = l.find((x) => x.camp === "caracteristica:6553");
  assert.ok(c, "lipsa nu e legata de id-ul caracteristicii");
  assert.match(c!.eticheta, /Mărime/, "se spune NUMELE ei, nu numarul");
});

test("eMAG pregatire: o caracteristica completata cu spatii nu conteaza completata", () => {
  const l = ceLipseste(
    PRODUS_BUN,
    { ...CATEGORIE_BUNA, completate: [{ id: 6553, value: "   " }] },
    MAGAZIN_BUN, false,
  );
  assert.ok(l.some((x) => x.camp === "caracteristica:6553"));
});

test("eMAG pregatire: variante fara grup de variante = piedica", () => {
  /*
   * ⚠ eMAG PRIMESTE ofertele si nu da nicio eroare — doar nu le grupeaza. Marimile
   * apar ca produse fara legatura, iar cumparatorul nu poate schimba marimea din
   * pagina. Singurul loc unde se poate prinde e aici.
   */
  const l = ceLipseste(PRODUS_BUN, { ...CATEGORIE_BUNA, areTipFamilie: false }, MAGAZIN_BUN, true);
  assert.equal(sePoatePublica(l), false);
  assert.ok(l.some((x) => x.camp === "tip_familie"));
});

test("eMAG pregatire: fara variante, grupul nu conteaza", () => {
  const l = ceLipseste(PRODUS_BUN, { ...CATEGORIE_BUNA, areTipFamilie: false }, MAGAZIN_BUN, false);
  assert.equal(sePoatePublica(l), true);
});

test("eMAG pregatire: setarile magazinului opresc si ele", () => {
  const l = ceLipseste(PRODUS_BUN, CATEGORIE_BUNA, { ...MAGAZIN_BUN, vat_id: null, handling_time: null }, false);
  assert.ok(l.some((x) => x.camp === "tva"));
  assert.ok(l.some((x) => x.camp === "timp_pregatire"));
  assert.equal(sePoatePublica(l), false);
});

test("eMAG pregatire: marca si SKU sunt cerute la orice produs nou", () => {
  const l = ceLipseste({ ...PRODUS_BUN, brand: null, sku: "  " }, CATEGORIE_BUNA, MAGAZIN_BUN, false);
  assert.ok(l.some((x) => x.camp === "brand"));
  assert.ok(l.some((x) => x.camp === "sku"));
});

/* ── Ce nu opreste, dar costa ──────────────────────────────────────────────── */

test("eMAG pregatire: lipsurile recomandate NU opresc publicarea", () => {
  const l = ceLipseste(
    { ...PRODUS_BUN, description: null, weight_grams: null, dimensiuni: null },
    CATEGORIE_BUNA, MAGAZIN_BUN, false,
  );
  assert.equal(sePoatePublica(l), true);
  assert.equal(l.every((x) => x.gravitate === "recomandat"), true);
});

/* ── Imaginile, in cele doua forme reale ───────────────────────────────────── */

test("eMAG pregatire: imaginile se numara si ca siruri, si ca obiecte", () => {
  /*
   * `products.images` e `jsonb` si vine in ambele forme in datele reale. Numarate pe
   * una singura, jumatate din produse ar fi parut fara imagini si ar fi fost oprite
   * de la publicare pe degeaba.
   */
  assert.equal(numarImagini(["a", "b"]), 2);
  assert.equal(numarImagini([{ url: "a" }, { src: "b" }]), 2);
  assert.equal(numarImagini([{ url: "a" }, "b", { fara: "url" }]), 2);
  assert.equal(numarImagini(["", "   ", null]), 0);
  assert.equal(numarImagini(null), 0);
  assert.equal(numarImagini("nu e tablou"), 0);
});

/* ── Scorul ────────────────────────────────────────────────────────────────── */

test("eMAG pregatire: un produs care NU poate pleca nu trece de 60%", () => {
  /*
   * ═══ REGULA CARE FACE SCORUL FOLOSITOR ═══
   *
   * Daca scorul ar fi o medie a bifelor, un produs caruia ii lipseste categoria — deci
   * nu poate pleca deloc — ar fi aratat 90% fiindca are poze si descriere. Iar 90% il
   * face pe om sa creada ca mai e putin, cand de fapt nu e nimic de facut pana nu
   * leaga categoria.
   */
  const l = ceLipseste(PRODUS_BUN, null, MAGAZIN_BUN, false);
  assert.ok(scorPregatire(l) < 60, `scor ${scorPregatire(l)}`);
});

test("eMAG pregatire: scorul scade cu fiecare piedica, si nu ajunge la zero", () => {
  const putin = scorPregatire([{ camp: "a", eticheta: "", gravitate: "blocheaza" }]);
  const mult = scorPregatire(Array.from({ length: 8 }, (_, i) => ({
    camp: String(i), eticheta: "", gravitate: "blocheaza" as const,
  })));
  assert.ok(mult < putin);
  assert.ok(mult >= 5, "un scor de zero n-ar spune nimic in plus fata de 5");
});

test("eMAG pregatire: fara piedici, scorul sta peste 60 oricate recomandari ar lipsi", () => {
  const multe = Array.from({ length: 20 }, (_, i) => ({
    camp: String(i), eticheta: "", gravitate: "recomandat" as const,
  }));
  assert.ok(scorPregatire(multe) >= 60);
  assert.equal(sePoatePublica(multe), true);
});
