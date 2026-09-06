import assert from "node:assert/strict";
import { test } from "node:test";
import { contextulCosului, subtotalMaximDinCatalog, type ProdusCotat } from "./cart-weight";

/**
 * Cantitatea nu atingea deloc pretul livrarii.
 *
 * Produsele cosului se incarcau numai daca magazinul avea reguli de transport sau
 * DPD pe kilograme — si niciun magazin din 127 n-avea vreuna. Deci greutatea
 * ramanea zero, cotatia pleca pe rezerva de un kilogram, iar comerciantul platea
 * curierul pentru cat cantareste coletul adevarat. 1408 produse active de pe 14
 * magazine au greutate completata.
 */

const p = (id: string, over: Record<string, unknown> = {}) => ({ id, weight_grams: 1000, ...over });

test("greutatea se inmulteste cu bucatile", () => {
  // Zece bucati de un kilogram inseamna zece kilograme, nu unul.
  const c = contextulCosului([{ productId: "p1", quantity: 10 }], [p("p1")]);
  assert.equal(c.weightKg, 10);
  assert.equal(c.quantity, 10);
});

test("mai multe linii se aduna", () => {
  const c = contextulCosului(
    [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 3 }],
    [p("p1", { weight_grams: 250 }), p("p2", { weight_grams: 1500 })],
  );
  assert.equal(c.weightKg, 5); // 2 x 0,25 + 3 x 1,5
  assert.equal(c.quantity, 5);
});

test("produsele fara greutate completata nu inventeaza una", () => {
  // Azi niciun produs de pe platforma n-are `weight_grams`, deci asta e cazul
  // curent: se intoarce zero, iar apelantul cade pe rezerva lui de un kilogram.
  const c = contextulCosului([{ productId: "p1", quantity: 4 }], [p("p1", { weight_grams: null })]);
  assert.equal(c.weightKg, 0);
  assert.equal(c.quantity, 4, "bucatile se numara oricum");
});

test("un produs negasit in catalog isi pierde greutatea, nu bucatile", () => {
  // Sters, sau al altui magazin: coletul tot pleaca cu bucatile lui.
  const c = contextulCosului([{ productId: "p1", quantity: 2 }, { productId: "strain", quantity: 3 }], [p("p1")]);
  assert.equal(c.weightKg, 2);
  assert.equal(c.quantity, 5);
});

test("cantitatea se clemeaza, ca in browser", () => {
  // La comanda, ce trece de plafon se REFUZA, deci un cos de 5000 de bucati nu
  // ajunge sa fie livrat. Aici clema tine doar greutatea intr-un numar posibil.
  assert.equal(contextulCosului([{ productId: "p1", quantity: 0.5 }], [p("p1")]).weightKg, 1);
  assert.equal(contextulCosului([{ productId: "p1", quantity: -3 }], [p("p1")]).weightKg, 1);
  assert.equal(contextulCosului([{ productId: "p1", quantity: NaN }], [p("p1")]).weightKg, 1);
  assert.equal(contextulCosului([{ productId: "p1", quantity: 1e9 }], [p("p1")]).weightKg, 999);
});

test("o greutate negativa in catalog nu scade din colet", () => {
  const c = contextulCosului([{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 1 }],
    [p("p1"), p("p2", { weight_grams: -5000 })]);
  assert.equal(c.weightKg, 1);
});

test("clasele, categoriile si id-urile ies fara duplicate", () => {
  const c = contextulCosului(
    [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 1 }, { productId: "p1", quantity: 1 }],
    [p("p1", { shipping_class: "fragil", category: "c1" }), p("p2", { shipping_class: "fragil", category: "c2" })],
  );
  assert.deepEqual(c.classIds, ["fragil"]);
  assert.deepEqual(c.categories, ["c1", "c2"]);
  assert.deepEqual(c.productIds, ["p1", "p2"]);
});

test("fara cos, contextul e gol — nu zero-uri inventate", () => {
  assert.deepEqual(contextulCosului(undefined, []), {
    weightKg: 0, quantity: 0, classIds: [], categories: [], productIds: [],
  });
});

// ── Plafonul de subtotal pentru regulile de transport ────────────────────────
//
// Regulile („livrare gratuita peste 200 de lei") primeau subtotalul de la
// BROWSER, iar pretul care iesea din ele pleaca SEMNAT: cine trimitea o suma
// umflata obtinea transport gratuit semnat pentru un cos ieftin.

const CATALOG: ProdusCotat[] = [
  { id: "p1", price: 50 },
  { id: "p2", price: 25 },
  { id: "fara-pret", price: null },
];

test("plafonul e suma din catalog, nu ce spune clientul", () => {
  assert.equal(subtotalMaximDinCatalog([{ productId: "p1", quantity: 2 }], CATALOG), 100);
  assert.equal(
    subtotalMaximDinCatalog([{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 4 }], CATALOG),
    150,
  );
});

test("ATACUL: suma umflata e taiata la cat sustine catalogul", () => {
  const cerutDeClient = 5000;
  const plafon = subtotalMaximDinCatalog([{ productId: "p1", quantity: 1 }], CATALOG);
  assert.equal(Math.min(cerutDeClient, plafon), 50, "nu poate depasi 50 lei");
});

test("CAZUL LEGITIM: o reducere coboara suma si trece neatinsa", () => {
  const dupaReducere = 40; // 50 lei cu 20% reducere
  const plafon = subtotalMaximDinCatalog([{ productId: "p1", quantity: 1 }], CATALOG);
  assert.equal(Math.min(dupaReducere, plafon), 40, "reducerea nu e anulata de plafon");
});

test("un cos nedeclarat nu sustine nicio suma", () => {
  assert.equal(subtotalMaximDinCatalog([], CATALOG), 0);
  assert.equal(subtotalMaximDinCatalog(undefined, CATALOG), 0);
});

test("produsele negasite sau fara pret nu adauga la plafon", () => {
  assert.equal(subtotalMaximDinCatalog([{ productId: "inexistent", quantity: 9 }], CATALOG), 0);
  assert.equal(subtotalMaximDinCatalog([{ productId: "fara-pret", quantity: 9 }], CATALOG), 0);
});

test("cantitatea absurda e normalizata, ca peste tot", () => {
  const r = subtotalMaximDinCatalog([{ productId: "p1", quantity: 99999 }], CATALOG);
  assert.ok(r <= 50 * 999, "cantitatea trece prin normalizeazaCantitate");
});

/*
 * O combinatie mai SCUMPA decat baza intra intreaga in plafon.
 *
 * Pana la 06.09.2026 plafonul se calcula doar din `products.price`. Un tricou de
 * 50 lei la baza, cu XXL la 80, era plafonat la 50 — deci un cos care chiar facea
 * 80 de lei nu atingea pragul de livrare gratuita de 60, iar valoarea declarata la
 * DHL pleca cu 30 de lei sub marfa.
 *
 * ⚠ Proba a fost confruntata cu defectul: cu vechiul corp (`total += baza * qty`)
 * a doua asertiune cade cu 50 in loc de 80.
 */
const CU_COMBINATII: ProdusCotat[] = [{
  id: "tricou",
  price: 50,
  page_sections: {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["S", "XXL"] }],
      combinations: [
        { id: "c1", title: "S", price: "50", enabled: true },
        { id: "c2", title: "XXL", price: "80", enabled: true },
        // Dezactivata: nu are voie sa ridice plafonul, altfel o combinatie scoasa
        // din vanzare ar largi apararea impotriva umflarii.
        { id: "c3", title: "AURIT", price: "5000", enabled: false },
      ],
    },
  },
}];

test("plafonul cuprinde combinatia cea mai scumpa, nu doar pretul de baza", () => {
  assert.equal(subtotalMaximDinCatalog([{ productId: "tricou", quantity: 1 }], CU_COMBINATII), 80);
  assert.equal(subtotalMaximDinCatalog([{ productId: "tricou", quantity: 3 }], CU_COMBINATII), 240);
});

test("o combinatie DEZACTIVATA nu ridica plafonul", () => {
  // 5000 lei sta pe o combinatie stinsa; plafonul ramane la cea mai scumpa activa.
  assert.equal(subtotalMaximDinCatalog([{ productId: "tricou", quantity: 1 }], CU_COMBINATII), 80);
});

test("fara combinatii, plafonul ramane exact cel de dinainte", () => {
  assert.equal(subtotalMaximDinCatalog([{ productId: "p1", quantity: 2 }], CATALOG), 100);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ PERSONALIZAREA URCA PLAFONUL
   ══════════════════════════════════════════════════════════════════════════ */

/** Fototapetul: 89 lei in catalog, 910 lei cum se vinde el cu adevarat. */
const FOTOTAPET: ProdusCotat[] = [{
  id: "ft",
  price: 89,
  page_sections: {
    customization: {
      enabled: true,
      fields: [
        { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
        { id: "mat", type: "butoane", label: "Material", required: true,
          optiuni: [
            { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
            { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
          ] },
        { id: "prot", type: "comutator", label: "Protectie", required: false,
          impact: { fel: "pe_m2", suma: 15 } },
      ],
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
        includePretulProdusului: false },
    },
  },
}];

const PERSONALIZARE = { dim: { latime: 350, inaltime: 250 }, mat: "prm", prot: true };

test("⚠ plafonul cuprinde si pretul personalizarii, nu doar pe cel de catalog", () => {
  /*
   * ⚠ CE COSTA CAND NU-L CUPRINDE, si sunt doua lucruri, amandoua in dauna comerciantului:
   *
   *  1. `valoareMarfii` pleaca la DHL ca `declaredValue`. Coletul se asigura pe 89 de lei in
   *     loc de 910 — pierdut pe drum, diferenta o plateste magazinul.
   *  2. „Livrare gratuita peste 200 de lei" nu se declansa la o comanda de 910 lei.
   *
   * Perechea obligatorie: FARA valori se ramane la 89. Numai asa se vede ca cifra de 910 vine
   * chiar din personalizare, si nu dintr-un plafon devenit permisiv.
   */
  assert.equal(
    subtotalMaximDinCatalog([{ productId: "ft", quantity: 1 }], FOTOTAPET), 89,
    "fara valori, plafonul trebuie sa ramana cel de catalog",
  );
  assert.equal(
    subtotalMaximDinCatalog([{ productId: "ft", quantity: 1, personalizare: PERSONALIZARE }], FOTOTAPET),
    910,
  );
  /* Si se inmulteste cu bucatile, ca orice linie. */
  assert.equal(
    subtotalMaximDinCatalog([{ productId: "ft", quantity: 2, personalizare: PERSONALIZARE }], FOTOTAPET),
    1820,
  );
});

test("⚠ valorile care NU trec de validare cad inapoi pe pretul de catalog", () => {
  /*
   * Plafonul e ce putem SUSTINE noi, deci in dubiu ramane cel MIC: un plafon prea mic nu strica
   * nimic (suma ceruta de browser e oricum plafonata in jos), unul umflat pe date stricate ar fi
   * scos livrare gratuita semnata.
   *
   * ⚠ Si asta e granita reala a portii: cine trimite 5000 cm inaltime nu ridica plafonul la
   * cerul lui, fiindca marginile sunt ALE COMERCIANTULUI si validarea le tine.
   */
  const rele = [
    {},                                                        /* camp obligatoriu lipsa */
    { dim: { latime: 350, inaltime: 250 }, mat: "inventat" },   /* optiune care nu exista */
    { dim: { latime: 5000, inaltime: 5000 }, mat: "prm" },      /* peste marginile comerciantului */
    { dim: "text", mat: "prm" },                                /* forma cu totul gresita */
  ];
  for (const brut of rele) {
    assert.equal(
      subtotalMaximDinCatalog([{ productId: "ft", quantity: 1, personalizare: brut }], FOTOTAPET), 89,
      `plafonul s-a lasat urcat de ${JSON.stringify(brut)}`,
    );
  }
});

test("⚠ un produs FARA personalizare ignora valorile trimise langa el", () => {
  /* Altfel un client putea urca plafonul oricarui produs trimitand valori pe langa. */
  assert.equal(
    subtotalMaximDinCatalog([{ productId: "p1", quantity: 2, personalizare: PERSONALIZARE }], CATALOG),
    100,
  );
});
