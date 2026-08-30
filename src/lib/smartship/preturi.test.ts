import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { cheiaOfertei, dataRo, etichetaOferta, ofertePosibile, pretCuTva, termenLivrare, textRamburs } from "./preturi";
import type { OfertaSmartship } from "./client";

const CARGUS: OfertaSmartship = {
  courier_id: 1,
  courier_name: "Cargus",
  cost: 16.13,
  cost_fara_tva: 13.33,
  ramburs_delay: { median: 4, p75: 5 },
  delivery_date: "2026-07-10",
  pickup_date: "2026-07-09",
};

const DPD_BYOC: OfertaSmartship = {
  courier_id: 6,
  courier_name: "DPD",
  cost: 16.61,
  cost_fara_tva: 13.73,
  own_contract: true,
  cucli_id: 35,
  cost_retur: 13.29,
  delivery_date: "2026-07-10",
};

const DPD_SMARTSHIP: OfertaSmartship = {
  courier_id: 6,
  courier_name: "DPD",
  cost: 22.5,
  cost_fara_tva: 18.91,
  delivery_date: "2026-07-11",
};

describe("SmartShip: pretul", () => {
  /*
   * ⚠ `cost` e CU TVA. Un transport afisat fara ar fi cu ~19% mai mic decat cel
   * incasat — clasa de defecte pe care auditul de preturi a inchis-o in 40 de
   * locuri.
   */
  test("se ia `cost`, cel cu TVA", () => {
    assert.equal(pretCuTva(CARGUS), 16.13);
  });

  test("fara `cost` oferta se ARUNCA, nu cade pe net", () => {
    assert.equal(pretCuTva({ courier_id: 1, cost_fara_tva: 13.33 }), null);
    assert.equal(ofertePosibile([{ courier_id: 1, courier_name: "X", cost_fara_tva: 10 }]).length, 0);
  });

  test("un pret zero sau negativ nu e o oferta", () => {
    assert.equal(pretCuTva({ courier_id: 1, cost: 0 }), null);
    assert.equal(pretCuTva({ courier_id: 1, cost: -5 }), null);
  });
});

describe("SmartShip: cheia ofertei cuprinde CONTRACTUL", () => {
  /*
   * ⚠ Cu `show_byoc: 1`, ACELASI curier apare de doua ori, la preturi diferite.
   * O cheie facuta doar din `courier_id` le-ar prabusi una peste alta —
   * cumparatorul ar alege una si ar primi alta. Exact defectul de la Innoship.
   */
  test("acelasi curier pe doua contracte da doua oferte", () => {
    const oferte = ofertePosibile([DPD_BYOC, DPD_SMARTSHIP]);
    assert.equal(oferte.length, 2);
    assert.notEqual(cheiaOfertei(oferte[0]), cheiaOfertei(oferte[1]));
  });

  test("aceeasi oferta de doua ori se pastreaza o data", () => {
    assert.equal(ofertePosibile([CARGUS, { ...CARGUS }]).length, 1);
  });

  test("linia de contract propriu se recunoaste in eticheta", () => {
    const oferte = ofertePosibile([DPD_BYOC, DPD_SMARTSHIP]);
    const byoc = oferte.find((o) => o.contractPropriu)!;
    const ss = oferte.find((o) => !o.contractPropriu)!;
    assert.equal(etichetaOferta(byoc), "DPD (contractul tau)");
    assert.equal(etichetaOferta(ss), "DPD");
  });
});

describe("SmartShip: filtrarea si asezarea", () => {
  test("ordinea e dupa pret, nu cea din raspuns", () => {
    const oferte = ofertePosibile([DPD_SMARTSHIP, CARGUS, DPD_BYOC]);
    assert.deepEqual(oferte.map((o) => o.pret), [16.13, 16.61, 22.5]);
  });

  test("filtrul comerciantului taie curierii nealesi", () => {
    const oferte = ofertePosibile([CARGUS, DPD_SMARTSHIP], { curieri_permisi: [1] });
    assert.equal(oferte.length, 1);
    assert.equal(oferte[0].courierId, 1);
  });

  test("lista goala de curieri inseamna TOTI, nu niciunul", () => {
    assert.equal(ofertePosibile([CARGUS, DPD_SMARTSHIP], { curieri_permisi: [] }).length, 2);
    assert.equal(ofertePosibile([CARGUS, DPD_SMARTSHIP], {}).length, 2);
  });

  test("o oferta fara curier nu poate ajunge la emitere, deci se arunca", () => {
    assert.equal(ofertePosibile([{ courier_name: "X", cost: 10 }]).length, 0);
    assert.equal(ofertePosibile([{ courier_id: 0, courier_name: "X", cost: 10 }]).length, 0);
  });

  test("raspunsul gol nu crapa", () => {
    assert.deepEqual(ofertePosibile([]), []);
    assert.deepEqual(ofertePosibile(undefined as unknown as OfertaSmartship[]), []);
  });
});

describe("SmartShip: termenul si rambursul", () => {
  test("data lor se arata ca data, nu tradusa in zile lucratoare", () => {
    assert.equal(dataRo("2026-07-10"), "10.07.2026");
    assert.equal(termenLivrare(ofertePosibile([CARGUS])[0]), "livrare estimata 10.07.2026");
  });

  test("fara data nu se inventeaza un termen", () => {
    assert.equal(dataRo(null), null);
    assert.equal(termenLivrare(ofertePosibile([{ courier_id: 1, courier_name: "X", cost: 10 }])[0]), undefined);
  });

  test("intarzierea rambursului se spune cu ambele cifre", () => {
    const o = ofertePosibile([CARGUS])[0];
    assert.equal(textRamburs(o), "ramburs virat in 4 zile (de obicei sub 5 zile)");
  });

  test("cand nu au date, nu se spune nimic", () => {
    const o = ofertePosibile([{ ...CARGUS, ramburs_delay: null }])[0];
    assert.equal(textRamburs(o), null);
  });

  test("o singura zi se scrie la singular", () => {
    const o = ofertePosibile([{ ...CARGUS, ramburs_delay: { median: 1, p75: 1 } }])[0];
    assert.equal(textRamburs(o), "ramburs virat in o zi");
  });
});

describe("SmartShip: eticheta", () => {
  test("cumparatorul vede curierul real, nu numele brokerului", () => {
    assert.equal(etichetaOferta(ofertePosibile([CARGUS])[0]), "Cargus");
  });

  test("fara nume ramane ceva de citit, nu un rand gol", () => {
    const o = ofertePosibile([{ courier_id: 9, cost: 10 }])[0];
    assert.equal(etichetaOferta(o), "Livrare prin SmartShip");
  });
});
