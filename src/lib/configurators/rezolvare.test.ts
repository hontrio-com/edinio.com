import test from "node:test";
import assert from "node:assert/strict";
import {
  rezolvitorul, configuratorulAplicat, doarActive,
  type LegaturaCategorie, type LegaturaProdus, type RandCategorie,
} from "./rezolvare";

/*
 * Arborele de proba, luat dupa forma reala din productie: acelasi NUME sub doi parinti diferiti
 * — unicitatea din baza e pe frati, nu pe magazin, si in productie sunt 8 astfel de perechi.
 *
 *   Deratizare > Insecticide
 *   Farmacie   > Insecticide
 *   Imbracaminte > Femei > Rochii
 */
const ARBORE: RandCategorie[] = [
  { id: "der", name: "Deratizare", parent_id: null },
  { id: "i1", name: "Insecticide", parent_id: "der" },
  { id: "far", name: "Farmacie", parent_id: null },
  { id: "i2", name: "Insecticide", parent_id: "far" },
  { id: "imb", name: "Imbracaminte", parent_id: null },
  { id: "fem", name: "Femei", parent_id: "imb" },
  { id: "roc", name: "Rochii", parent_id: "fem" },
];

const p = (id: string, category: string | null) => ({ id, category });

/* ── Legatura directa ────────────────────────────────────────────────────── */

test("legatura DIRECTA bate orice mostenire", () => {
  const r = rezolvitorul(
    [{ configurator_id: "cfgA", product_id: "p1", fel: "direct" }],
    [{ configurator_id: "cfgB", categorie: "Rochii" }],
    ARBORE,
  );
  assert.deepEqual(r(p("p1", "Rochii")), { fel: "direct", configuratorId: "cfgA" });
});

test("fara nicio legatura, niciun configurator", () => {
  const r = rezolvitorul([], [], ARBORE);
  assert.deepEqual(r(p("p1", "Rochii")), { fel: "niciunul" });
  assert.equal(configuratorulAplicat(r(p("p1", "Rochii"))), null);
});

test("un produs fara categorie nu mosteneste nimic", () => {
  const r = rezolvitorul([], [{ configurator_id: "cfg", categorie: "Rochii" }], ARBORE);
  assert.deepEqual(r(p("p1", null)), { fel: "niciunul" });
  assert.deepEqual(r(p("p1", "   ")), { fel: "niciunul" });
});

/* ── Mostenirea din categorie ────────────────────────────────────────────── */

test("mostenirea se aplica pe chiar categoria aleasa", () => {
  const r = rezolvitorul([], [{ configurator_id: "cfg", categorie: "Rochii" }], ARBORE);
  assert.deepEqual(r(p("p1", "Rochii")), { fel: "categorie", configuratorId: "cfg", prinCategoria: "Rochii" });
});

test("SI PE SUBARBORE: o categorie-parinte prinde si frunzele", () => {
  /*
   * Comerciantul isi alege declansatorul dintr-un arbore, deci alege firesc „Imbracaminte", in
   * timp ce produsele stau in frunze. Aceeasi coborare ca la oferte — acelasi ajutor, nu o a
   * doua parcurgere care ar fi ajuns sa raspunda altfel.
   */
  const r = rezolvitorul([], [{ configurator_id: "cfg", categorie: "Imbracaminte" }], ARBORE);
  assert.equal(configuratorulAplicat(r(p("p1", "Rochii"))), "cfg");
  assert.equal(configuratorulAplicat(r(p("p2", "Femei"))), "cfg");
  assert.equal(configuratorulAplicat(r(p("p3", "Deratizare"))), null);
});

test("EXCLUDEREA scoate produsul de sub configuratorul mostenit", () => {
  const legaturi: LegaturaProdus[] = [{ configurator_id: "cfg", product_id: "p1", fel: "exclus" }];
  const r = rezolvitorul(legaturi, [{ configurator_id: "cfg", categorie: "Rochii" }], ARBORE);
  assert.deepEqual(r(p("p1", "Rochii")), { fel: "niciunul" });
  assert.equal(configuratorulAplicat(r(p("p2", "Rochii"))), "cfg", "ceilalti raman");
});

test("excluderea nu atinge legatura DIRECTA a altui configurator", () => {
  const legaturi: LegaturaProdus[] = [
    { configurator_id: "cfgB", product_id: "p1", fel: "exclus" },
    { configurator_id: "cfgA", product_id: "p1", fel: "direct" },
  ];
  const r = rezolvitorul(legaturi, [{ configurator_id: "cfgB", categorie: "Rochii" }], ARBORE);
  assert.deepEqual(r(p("p1", "Rochii")), { fel: "direct", configuratorId: "cfgA" });
});

/* ── Conflictul ──────────────────────────────────────────────────────────── */

test("CONFLICT: acelasi nume de categorie, sub doi parinti, cu doua configuratoare", () => {
  /*
   * Cazul real din productie. „Primul din baza" ar fi insemnat ca produsul isi schimba
   * configuratorul la o reordonare a randurilor, fara ca nimeni sa fi atins nimic.
   */
  const categorii: LegaturaCategorie[] = [
    { configurator_id: "cfgDer", categorie: "Deratizare" },
    { configurator_id: "cfgFar", categorie: "Farmacie" },
  ];
  const r = rezolvitorul([], categorii, ARBORE);
  const rez = r(p("p1", "Insecticide"));
  assert.equal(rez.fel, "conflict");
  assert.deepEqual(rez.fel === "conflict" ? rez.configuratoare : [], ["cfgDer", "cfgFar"]);
  assert.equal(configuratorulAplicat(rez), null, "la conflict, produsul NU primeste niciunul");
});

test("conflictul se raporteaza mereu in aceeasi ordine", () => {
  // Altfel mesajul din panou si-ar schimba forma de la o reincarcare la alta.
  const unaOrdine: LegaturaCategorie[] = [
    { configurator_id: "zzz", categorie: "Deratizare" },
    { configurator_id: "aaa", categorie: "Farmacie" },
  ];
  const alta = [...unaOrdine].reverse();
  const a = rezolvitorul([], unaOrdine, ARBORE)(p("p1", "Insecticide"));
  const b = rezolvitorul([], alta, ARBORE)(p("p1", "Insecticide"));
  assert.deepEqual(a, b);
  assert.deepEqual(a.fel === "conflict" ? a.configuratoare : [], ["aaa", "zzz"]);
});

test("o EXCLUDERE poate rezolva conflictul", () => {
  const categorii: LegaturaCategorie[] = [
    { configurator_id: "cfgDer", categorie: "Deratizare" },
    { configurator_id: "cfgFar", categorie: "Farmacie" },
  ];
  const legaturi: LegaturaProdus[] = [{ configurator_id: "cfgFar", product_id: "p1", fel: "exclus" }];
  const r = rezolvitorul(legaturi, categorii, ARBORE);
  assert.equal(configuratorulAplicat(r(p("p1", "Insecticide"))), "cfgDer");
});

test("si o legatura DIRECTA il rezolva, fara sa mai fie nevoie de excluderi", () => {
  const categorii: LegaturaCategorie[] = [
    { configurator_id: "cfgDer", categorie: "Deratizare" },
    { configurator_id: "cfgFar", categorie: "Farmacie" },
  ];
  const legaturi: LegaturaProdus[] = [{ configurator_id: "cfgAles", product_id: "p1", fel: "direct" }];
  const r = rezolvitorul(legaturi, categorii, ARBORE);
  assert.equal(configuratorulAplicat(r(p("p1", "Insecticide"))), "cfgAles");
});

test("acelasi configurator legat de doua categorii nu e conflict cu sine", () => {
  const categorii: LegaturaCategorie[] = [
    { configurator_id: "cfg", categorie: "Deratizare" },
    { configurator_id: "cfg", categorie: "Farmacie" },
  ];
  const r = rezolvitorul([], categorii, ARBORE);
  assert.equal(configuratorulAplicat(r(p("p1", "Insecticide"))), "cfg");
});

/* ── Rezistenta ──────────────────────────────────────────────────────────── */

test("un ciclu de parinti in date nu blocheaza randarea", () => {
  // `extindeCategoriile` are multime de vizitate; proba exista ca sa ramana asa.
  const stricat: RandCategorie[] = [
    { id: "a", name: "A", parent_id: "b" },
    { id: "b", name: "B", parent_id: "a" },
  ];
  const r = rezolvitorul([], [{ configurator_id: "cfg", categorie: "A" }], stricat);
  assert.equal(configuratorulAplicat(r(p("p1", "B"))), "cfg");
});

test("liste goale sau lipsa nu arunca", () => {
  const r = rezolvitorul([], [], []);
  assert.deepEqual(r(p("p1", "Orice")), { fel: "niciunul" });
});

test("un configurator legat de o categorie care nu mai exista nu prinde nimic", () => {
  const r = rezolvitorul([], [{ configurator_id: "cfg", categorie: "Stearsa" }], ARBORE);
  assert.deepEqual(r(p("p1", "Rochii")), { fel: "niciunul" });
  // ⚠ Dar prinde un produs a carui categorie poarta chiar numele acela: legatura e prin NUME,
  // deci un produs orfan cu textul „Stearsa" ramane legat. E consecinta modelului, scrisa pe fata.
  assert.equal(configuratorulAplicat(r(p("p2", "Stearsa"))), "cfg");
});

/* -- Doar cele active -------------------------------------------------- */

test("un configurator OPRIT nu mai intra in socoteala", () => {
  const categorii: LegaturaCategorie[] = [
    { configurator_id: "cfgOprit", categorie: "Deratizare" },
    { configurator_id: "cfgActiv", categorie: "Farmacie" },
  ];
  const active = new Set(["cfgActiv"]);
  const r = rezolvitorul([], doarActive(categorii, active), ARBORE);
  assert.equal(configuratorulAplicat(r(p("p1", "Insecticide"))), "cfgActiv");
});

test("OPRIREA UNUIA CHIAR REZOLVA CONFLICTUL", () => {
  /*
   * Filtrat dupa rezolvare, conflictul era deja pronuntat si produsul nu primea niciun
   * configurator — adica exact gestul prin care comerciantul incearca sa rezolve conflictul il
   * facea sa persiste.
   */
  const categorii: LegaturaCategorie[] = [
    { configurator_id: "cfgA", categorie: "Deratizare" },
    { configurator_id: "cfgB", categorie: "Farmacie" },
  ];
  const inainte = rezolvitorul([], categorii, ARBORE)(p("p1", "Insecticide"));
  assert.equal(inainte.fel, "conflict", "amandoua active: conflict, ca inainte");

  const dupa = rezolvitorul([], doarActive(categorii, new Set(["cfgA"])), ARBORE)(p("p1", "Insecticide"));
  assert.equal(configuratorulAplicat(dupa), "cfgA");
});

test("legatura DIRECTA catre un configurator oprit nu tine produsul in loc", () => {
  // Altfel produsul ramanea fara niciun configurator, desi mostenea unul activ din categorie.
  const legaturi: LegaturaProdus[] = [{ configurator_id: "cfgOprit", product_id: "p1", fel: "direct" }];
  const categorii: LegaturaCategorie[] = [{ configurator_id: "cfgActiv", categorie: "Rochii" }];
  const active = new Set(["cfgActiv"]);
  const r = rezolvitorul(doarActive(legaturi, active), doarActive(categorii, active), ARBORE);
  assert.equal(configuratorulAplicat(r(p("p1", "Rochii"))), "cfgActiv");
});

test("o EXCLUDERE catre un configurator oprit nu mai scoate nimic", () => {
  const legaturi: LegaturaProdus[] = [{ configurator_id: "cfgOprit", product_id: "p1", fel: "exclus" }];
  const active = new Set<string>();
  assert.deepEqual(doarActive(legaturi, active), []);
});

test("fara niciun configurator activ, nu ramane nicio legatura", () => {
  const categorii: LegaturaCategorie[] = [{ configurator_id: "cfg", categorie: "Rochii" }];
  assert.deepEqual(doarActive(categorii, new Set()), []);
});
