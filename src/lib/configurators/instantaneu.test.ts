import test from "node:test";
import assert from "node:assert/strict";
import { citesteInstantaneul, instantaneulLiniei } from "./instantaneu";
import { MAX_CAMPURI, MAX_LUNGIME_TEXT } from "./valori";

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

test("⚠ textele se taie DOAR peste ce se poate scrie, nu sub", () => {
  /*
   * ⚠ PROBA ASTA A FOST STRANSA, si merita spus de ce. Ea cerea `<= 50` randuri si `<= 200`
   * caractere — numere alese in cititor, sub ce poate SCRIE cumparatorul (2000 de caractere,
   * 200 de campuri). Deci pironea o taiere TACUTA: o placuta cu 320 de caractere se scria
   * intreaga in comanda si se citea taiata la 200, fara puncte de suspensie si fara niciun semn,
   * pe toate suprafetele. Atelierul grava primele 200 si taia in mijlocul unui cuvant.
   *
   * Marginile raman — instantaneul e `jsonb` editabil din panou, si un sir de zece mii de
   * caractere ar rupe si ecranul, si emailul, si continutul coletului — dar se iau acum de la
   * ce se poate scrie.
   */
  const r = citesteInstantaneul({
    rezumat: [
      { id: "g", eticheta: "E".repeat(5000), valoare: "V".repeat(5000) },
      ...Array.from({ length: 300 }, (_, i) => ({ id: `n${i}`, eticheta: "A", valoare: "B" })),
    ],
  });
  assert.ok(r);
  assert.ok(r.rezumat.length <= MAX_CAMPURI, `am pastrat ${r.rezumat.length} randuri`);
  assert.ok(r.rezumat[0].valoare.length <= MAX_LUNGIME_TEXT);

  /*
   * ⚠ SI CA NU SE TAIE CE E LEGITIM. Fara randul asta, garda de mai sus ar fi trecut si cu o
   * taiere la 10 caractere: `<= MAX` e adevarat pentru orice numar mai mic.
   */
  const lung = "x".repeat(320);
  const bun = citesteInstantaneul({ rezumat: [{ id: "g", eticheta: "Gravura", valoare: lung }] });
  assert.equal(bun?.rezumat[0].valoare, lung, "o gravura de 320 de caractere se taie tacut");

  const multe = citesteInstantaneul({
    rezumat: Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, eticheta: "A", valoare: "B" })),
  });
  assert.equal(multe?.rezumat.length, 60, "un configurator cu 60 de campuri pierde randuri");
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
