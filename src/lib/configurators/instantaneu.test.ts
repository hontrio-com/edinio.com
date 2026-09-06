import test from "node:test";
import assert from "node:assert/strict";
import { citesteInstantaneul, instantaneulLiniei } from "./instantaneu";

const BUN = {
  configuratorId: "c1",
  versiuneId: "v1",
  numarVersiune: 3,
  amprenta: "0f3asj30xcbam60dg0nhd0fcl9j4",
  grame: 750,
  valori: { g: { f: "text", v: "Robert" } },
  rezumat: [{ id: "g", eticheta: "Gravura", valoare: "Robert", scurt: true }],
};

test("un instantaneu intreg se citeste intreg", () => {
  const r = citesteInstantaneul(BUN);
  assert.ok(r);
  assert.equal(r.configuratorId, "c1");
  assert.equal(r.numarVersiune, 3);
  assert.equal(r.grame, 750);
  assert.deepEqual(r.rezumat.map((x) => x.valoare), ["Robert"]);
  assert.deepEqual(r.valori, { g: { f: "text", v: "Robert" } });
});

test("gramele lipsa se citesc ZERO, nu ca lipsa", () => {
  /*
   * ⚠ Comenzile scrise inainte de campul asta n-au grame — si sunt tocmai cele in care greseala ar
   * fi trecut neobservata. Cel care cantareste coletul ADUNA: o valoare care poate lipsi l-ar fi
   * pus sa aleaga el ce face cu lipsa, in fiecare din cele doua locuri unde se aduna greutate.
   */
  const r = citesteInstantaneul({ rezumat: BUN.rezumat });
  assert.ok(r);
  assert.equal(r.grame, 0);
});

test("gramele stricate nu ajung la curier", () => {
  /*
   * ⚠ `orders.items` e jsonb si se poate edita de mana. Un `"750"` trecut printr-un `Number()`
   * binevoitor ar fi mers, dar „greu" ar fi iesit `NaN` si ar fi otravit toata adunarea coletului:
   * o singura linie stricata ar fi trimis intreaga comanda la curier cu greutate nefinita. Un numar
   * negativ ar fi SCAZUT din colet.
   */
  for (const grame of ["750", "greu", -500, Number.NaN, Number.POSITIVE_INFINITY, null, {}, [750]]) {
    const r = citesteInstantaneul({ ...BUN, grame });
    assert.ok(r);
    assert.equal(r.grame, 0, `${JSON.stringify(grame)} a ajuns greutate`);
  }
});

test("o greutate buna trece prin `instantaneulLiniei`", () => {
  // Drumul adevarat: linia din `orders.items`, nu instantaneul gol.
  assert.equal(instantaneulLiniei({ product_id: "p1", configuratie: BUN })?.grame, 750);
});

test("FARA REZUMAT nu se intoarce nimic", () => {
  /*
   * ⚠ Rezumatul e singurul lucru pe care il citeste un om. Fara el, ecranul ar fi aratat o
   * eticheta „Configuratie" goala — care spune ca s-a pierdut ceva, fara sa spuna ce.
   */
  assert.equal(citesteInstantaneul({ ...BUN, rezumat: [] }), null);
  assert.equal(citesteInstantaneul({ ...BUN, rezumat: undefined }), null);
  assert.equal(citesteInstantaneul({ ...BUN, rezumat: "Gravura: Robert" }), null);
});

test("id-urile si versiunea lipsa NU opresc afisarea", () => {
  /*
   * ⚠ Ele sunt pentru urmarire. O comanda scrisa de o versiune veche de cod poate sa nu le aiba,
   * si atelierul tot trebuie sa afle ce are de gravat.
   */
  const r = citesteInstantaneul({ rezumat: BUN.rezumat });
  assert.ok(r);
  assert.equal(r.configuratorId, null);
  assert.equal(r.numarVersiune, null);
  assert.deepEqual(r.rezumat.map((x) => x.eticheta), ["Gravura"]);
});

test("randurile stricate se arunca, cele bune raman", () => {
  const r = citesteInstantaneul({
    rezumat: [
      { id: "g", eticheta: "Gravura", valoare: "Robert" },
      { eticheta: "Fara valoare" },
      { valoare: "Fara eticheta" },
      { eticheta: "  ", valoare: "  " },
      "gunoi",
      null,
      42,
    ],
  });
  assert.ok(r);
  assert.deepEqual(r.rezumat.map((x) => x.eticheta), ["Gravura"]);
});

test("textele se taie, ca sa nu rupa nici ecranul, nici AWB-ul", () => {
  /*
   * ⚠ Aceleasi randuri ajung pe ecranul de panou, in email si pe continutul coletului. Un sir de
   * zece mii de caractere venit dintr-o comanda veche sau dintr-o editare de mana le rupea pe
   * toate trei.
   */
  const r = citesteInstantaneul({
    rezumat: [
      { id: "g", eticheta: "E".repeat(5000), valoare: "V".repeat(5000) },
      ...Array.from({ length: 300 }, (_, i) => ({ id: `n${i}`, eticheta: "A", valoare: "B" })),
    ],
  });
  assert.ok(r);
  assert.ok(r.rezumat.length <= 50, `am pastrat ${r.rezumat.length} randuri`);
  assert.ok(r.rezumat[0].eticheta.length <= 200);
  assert.ok(r.rezumat[0].valoare.length <= 200);
});

test("VALORILE trec prin normalizare, nu se iau asa cum vin", () => {
  // ⚠ Forma poate fi de acum trei luni, sau atinsa de mana in consola.
  const r = citesteInstantaneul({
    rezumat: BUN.rezumat,
    valori: { g: { f: "text", v: "  Robert  " }, x: { f: "necunoscut" }, y: "gunoi" },
  });
  assert.ok(r);
  assert.deepEqual(r.valori, { g: { f: "text", v: "Robert" } });
});

test("orice gunoi intra si nimic nu arunca", () => {
  for (const x of [null, undefined, "text", 5, [], [1, 2], true, { rezumat: 7 }]) {
    assert.doesNotThrow(() => citesteInstantaneul(x));
    assert.equal(citesteInstantaneul(x), null);
  }
});

test("instantaneulLiniei ia campul din linia de comanda", () => {
  assert.ok(instantaneulLiniei({ product_id: "p1", name: "Cana", configuratie: BUN }));
  assert.equal(instantaneulLiniei({ product_id: "p1", name: "Cana" }), null);
  assert.equal(instantaneulLiniei(null), null);
  assert.equal(instantaneulLiniei("gunoi"), null);
});
