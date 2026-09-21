import test from "node:test";
import assert from "node:assert/strict";

import {
  DESPRE_CATEGORII, FARA_RESTRANGERE, areRestrangere, bazaPeCote, cereArborele,
  descrieRestrangerea, extindeCategoriileCodului, liniiPotrivite, parseRestrangere,
  restrangereValida, socotesteReducerea, type LinieDeCupon, type Restrangere,
} from "./restrangere";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN COD MARGINIT LA CEVA ANUME                                  (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ CEA MAI SCUMPA GRESEALA DE AICI E UN „VALID" CU REDUCERE ZERO.
 *
 * Ecranul pune transportul pe zero doar din TIPUL cuponului — nu intreaba pe
 * nimeni daca vreo linie se potriveste. Deci un `free_shipping` intors „valid,
 * dar cu 0 lei" ar fi dat transportul gratuit oricum, iar serverul ar fi
 * incasat transportul. La fel la procent: cuponul s-ar fi vazut aplicat pe
 * ecran, si s-ar fi incasat pretul intreg.
 *
 * De-aia „nu se potriveste nimic" inseamna REFUZ, nu reducere zero.
 */

const linie = (p: Partial<LinieDeCupon> & { productId: string }): LinieDeCupon => ({
  categorie: null, valoare: 100, ...p,
});

const COS: LinieDeCupon[] = [
  linie({ productId: "tricou", categorie: "Tricouri", valoare: 200 }),
  linie({ productId: "televizor", categorie: "Electronice", valoare: 3000 }),
];

const restrangere = (p: Partial<Restrangere>): Restrangere => ({ ...FARA_RESTRANGERE, ...p });

/* ── Socoteala ──────────────────────────────────────────────────────────── */

test("⚠⚠ procentul se aplica NUMAI liniilor potrivite, nu intregului cos", () => {
  /*
   * Fara asta, „10% la Imbracaminte" ar fi redus si televizorul din acelasi cos:
   * 320 de lei in loc de 20.
   */
  const r = socotesteReducerea({
    tip: "percent", valoare: 10, linii: COS, subtotal: 3200,
    restrangere: restrangere({ fel: "categorii", categorii: ["Tricouri"] }),
  });
  assert.equal(r.suma, 20, "s-a socotit pe tot cosul");
  assert.equal(r.baza, 200);
  assert.equal(r.potrivire, true);
});

test("⚠⚠ suma fixa se PLAFONEAZA la valoarea liniilor potrivite", () => {
  /*
   * „50 de lei la Accesorii" intr-un cos cu accesorii de 30 de lei scade 30, nu
   * 50 — altfel codul ar manca din restul cosului, adica din marfa pe care
   * comerciantul n-a pus-o in campanie.
   */
  const cos = [linie({ productId: "curea", categorie: "Accesorii", valoare: 30 }), linie({ productId: "tv", valoare: 3000 })];
  const r = socotesteReducerea({
    tip: "fixed", valoare: 50, linii: cos, subtotal: 3030,
    restrangere: restrangere({ fel: "categorii", categorii: ["Accesorii"] }),
  });
  assert.equal(r.suma, 30);
  assert.equal(r.baza, 30);
});

test("⚠⚠ cand nu se potriveste nimic, codul se REFUZA — nu da reducere zero", () => {
  for (const tip of ["percent", "fixed", "free_shipping"] as const) {
    const r = socotesteReducerea({
      tip, valoare: 20, linii: COS, subtotal: 3200,
      restrangere: restrangere({ fel: "categorii", categorii: ["Incaltaminte"] }),
    });
    assert.equal(r.potrivire, false, tip);
    assert.equal(r.suma, 0, tip);
    assert.equal(r.baza, 0, tip);
  }
});

test("⚠⚠ transportul gratuit cere MACAR o linie potrivita", () => {
  const cu = socotesteReducerea({
    tip: "free_shipping", valoare: 0, linii: COS, subtotal: 3200,
    restrangere: restrangere({ fel: "produse", produse: ["tricou"] }),
  });
  assert.equal(cu.potrivire, true);
  assert.equal(cu.suma, 0, "transportul gratuit nu scade bani din marfa");

  const fara = socotesteReducerea({
    tip: "free_shipping", valoare: 0, linii: COS, subtotal: 3200,
    restrangere: restrangere({ fel: "produse", produse: ["pantofi"] }),
  });
  assert.equal(fara.potrivire, false);
});

test("⚠⚠ FARA restrangere, socoteala ramane LITERA CU LITERA cea de pana acum", () => {
  /*
   * ⚠ Si se sprijina pe `subtotal`, nu pe suma liniilor: liniile pot sa nu
   * acopere tot (extraoptiuni, rotunjiri). O schimbare aici ar fi mutat bani pe
   * TOATE codurile existente, nu doar pe cele noi.
   */
  const p = socotesteReducerea({ tip: "percent", valoare: 10, linii: COS, subtotal: 3250, restrangere: FARA_RESTRANGERE });
  assert.equal(p.suma, 325, "procentul nu mai e pe subtotalul autoritar");
  assert.equal(p.potrivire, true);

  const f = socotesteReducerea({ tip: "fixed", valoare: 5000, linii: COS, subtotal: 3250, restrangere: FARA_RESTRANGERE });
  assert.equal(f.suma, 3250, "suma fixa nu mai e plafonata la subtotal");

  const t = socotesteReducerea({ tip: "free_shipping", valoare: 0, linii: [], subtotal: 100, restrangere: FARA_RESTRANGERE });
  assert.equal(t.potrivire, true, "un cod de transport nerestrans nu mai merge pe un cos oarecare");
});

test("⚠ banii se rotunjesc la doi bani, nu se scurg", () => {
  const r = socotesteReducerea({
    tip: "percent", valoare: 33, linii: [linie({ productId: "a", categorie: "X", valoare: 10.1 })],
    subtotal: 10.1, restrangere: restrangere({ fel: "categorii", categorii: ["X"] }),
  });
  assert.equal(r.suma, 3.33);
});

/* ── Potrivirea ─────────────────────────────────────────────────────────── */

test("restrangerea pe produse se uita la id, nu la nume", () => {
  const r = restrangere({ fel: "produse", produse: ["tricou"] });
  assert.deepEqual(liniiPotrivite(COS, r).map((l) => l.productId), ["tricou"]);
});

test("⚠ un produs fara categorie nu intra intr-o restrangere pe categorii", () => {
  const cos = [linie({ productId: "x", categorie: null, valoare: 50 })];
  assert.equal(liniiPotrivite(cos, restrangere({ fel: "categorii", categorii: ["Orice"] })).length, 0);
});

test("⚠⚠ se coboara TOT subarborele de categorii, ca la oferte", () => {
  /*
   * Comerciantul alege firesc un parinte („Scule"), in timp ce produsele stau in
   * frunze. Fara coborare, un cod pe „Scule" n-ar fi prins nicio bormasina — si
   * ofertele, care ruleaza in ACELASI checkout, ar fi raspuns altfel la aceeasi
   * intrebare.
   */
  const arbore = [
    { id: "1", name: "Scule", parent_id: null },
    { id: "2", name: "Bormasini", parent_id: "1" },
    { id: "3", name: "Percutante", parent_id: "2" },
    { id: "4", name: "Gradina", parent_id: null },
  ];
  const r = restrangere({ fel: "categorii", categorii: ["Scule"] });
  const extinse = extindeCategoriileCodului(arbore, r)!;
  assert.deepEqual([...extinse].sort(), ["Bormasini", "Percutante", "Scule"]);

  const cos = [
    linie({ productId: "b", categorie: "Percutante", valoare: 400 }),
    linie({ productId: "g", categorie: "Gradina", valoare: 100 }),
  ];
  assert.deepEqual(liniiPotrivite(cos, r, extinse).map((l) => l.productId), ["b"]);
});

test("⚠ arborele se cere doar cand chiar trebuie", () => {
  assert.equal(cereArborele(FARA_RESTRANGERE), false);
  assert.equal(cereArborele(restrangere({ fel: "produse", produse: ["a"] })), false);
  assert.equal(cereArborele(restrangere({ fel: "categorii", categorii: ["X"] })), true);
  assert.equal(cereArborele(restrangere({ fel: "categorii", categorii: [] })), false);
});

/* ── Ce vine din coloana `jsonb` ────────────────────────────────────────── */

test("⚠ o restrangere stricata NU arunca, cade pe „merge pe tot", () => {
  /* Coloana e `jsonb` liber. O valoare stricata n-are voie sa opreasca un checkout. */
  for (const v of [null, undefined, 42, "text", [], { fel: "inventat" }]) {
    const r = parseRestrangere(v);
    assert.equal(r.fel, "tot", JSON.stringify(v));
    assert.equal(areRestrangere(r), false);
  }
});

test("⚠⚠ un fel ales cu lista GOALA nu cade pe „tot", () => {
  /*
   * „Doar pe produsele astea", cu lista goala, inseamna „pe niciun produs".
   * Citit ca „pe tot", un cod restrans gresit ar fi dat reducerea pe intreg
   * cosul — adica taman pe dos fata de ce a cerut comerciantul.
   */
  const r = parseRestrangere({ fel: "produse", produse: [] });
  assert.equal(r.fel, "produse");
  assert.equal(areRestrangere(r), true);
  assert.equal(liniiPotrivite(COS, r).length, 0);

  const s = socotesteReducerea({ tip: "percent", valoare: 10, linii: COS, subtotal: 3200, restrangere: r });
  assert.equal(s.potrivire, false, "un cod restrans la nimic a dat reducere");
});

test("⚠ si formularul il opreste, ca sa nu se ajunga acolo", () => {
  assert.ok("error" in restrangereValida(parseRestrangere({ fel: "produse", produse: [] })));
  assert.ok("error" in restrangereValida(parseRestrangere({ fel: "categorii", categorii: [] })));
  assert.ok("ok" in restrangereValida(FARA_RESTRANGERE));
  assert.ok("ok" in restrangereValida(parseRestrangere({ fel: "produse", produse: ["a"] })));
});

test("listele se curata: fara goluri, fara duplicate, fara spatii", () => {
  const r = parseRestrangere({ fel: "produse", produse: ["a", "a", "  b  ", "", 7, null] });
  assert.deepEqual(r.produse, ["a", "b"]);
});

/* ── Baza pe cote, pentru factura ───────────────────────────────────────── */

test("⚠⚠ se tine minte PE CE COTE a cazut reducerea", () => {
  /*
   * Pe factura, o suma fara cota proprie se imparte PROPORTIONAL peste toate
   * cotele comenzii (`imparteProportional`), fiindca o reducere obisnuita
   * micsoreaza baza FIECAREI cote. Cu un cod restrans, presupunerea aia nu mai e
   * adevarata: o reducere legata de liniile de 11% ar fi fost facturata ca si
   * cum ar fi atins si liniile de 21%. Totalul ar fi parut corect, defalcarea de
   * TVA ar fi fost gresita, si nici garda de reconciliere n-ar fi vazut-o.
   */
  const cos = [
    linie({ productId: "carte", categorie: "Carti", valoare: 100, cota: 11 }),
    linie({ productId: "tv", categorie: "Electronice", valoare: 900, cota: 21 }),
  ];
  const r = socotesteReducerea({
    tip: "percent", valoare: 10, linii: cos, subtotal: 1000,
    restrangere: restrangere({ fel: "categorii", categorii: ["Carti"] }),
  });
  assert.equal(r.suma, 10);
  assert.deepEqual(r.peCote, [{ cota: 11, valoare: 100 }], "reducerea ar pleca pe factura si peste 21%");
});

test("⚠ liniile fara cota nu inventeaza una", () => {
  assert.deepEqual(bazaPeCote([linie({ productId: "a", valoare: 10 })]), []);
  assert.deepEqual(bazaPeCote([linie({ productId: "a", valoare: 10, cota: null })]), []);
});

test("cotele se aduna pe grupe si se asaza crescator", () => {
  const b = bazaPeCote([
    linie({ productId: "a", valoare: 10, cota: 21 }),
    linie({ productId: "b", valoare: 5, cota: 11 }),
    linie({ productId: "c", valoare: 2.5, cota: 21 }),
  ]);
  assert.deepEqual(b, [{ cota: 11, valoare: 5 }, { cota: 21, valoare: 12.5 }]);
});

/* ── Ce se spune pe ecran ───────────────────────────────────────────────── */

test("⚠⚠ comerciantului i se spune CE NU POATE face potrivirea pe nume", () => {
  /*
   * Amandoua sunt urmari ale felului in care sunt facute categoriile in casa
   * (`products.category` e un NUME, iar unicitatea e pe `business_id, parent_id,
   * name`), nu alegeri ale etapei asteia — dar el n-are de unde sti.
   */
  assert.match(DESPRE_CATEGORII, /redenumești/i);
  assert.match(DESPRE_CATEGORII, /același nume/i);
});

test("textul de sub camp spune cate lucruri s-au ales", () => {
  assert.match(descrieRestrangerea(FARA_RESTRANGERE, null), /tot ce e în magazin/i);
  assert.match(descrieRestrangerea(restrangere({ fel: "produse", produse: ["a"] }), null), /produsul ales/);
  assert.match(descrieRestrangerea(restrangere({ fel: "produse", produse: ["a", "b"] }), null), /cele 2 produse/);
  assert.match(descrieRestrangerea(restrangere({ fel: "produse", produse: [] }), null), /n-ar prinde nimic/i);
  assert.match(descrieRestrangerea(restrangere({ fel: "categorii", categorii: ["X"] }), 12), /se potrivesc 12/);
});
