import { strict as assert } from "node:assert";
import { test } from "node:test";
import { etichetaOferta, ofertePosibile, parseazaPretRo } from "./preturi";
import type { RaspunsCotare, ServiciuEcolet } from "./client";

/*
 * ⚠ Nimic din eColet nu se poate proba pe fir fara tokenul comerciantului. Aici
 * se verifica exact partea in care o greseala NU produce nicio eroare: un pret
 * citit gresit se scrie in comanda si se incaseaza gresit.
 */

// ─── Pretul ───────────────────────────────────────────────────────────────────

test("⚠ pretul vine cu VIRGULA zecimala, nu cu punct", () => {
  /*
   * Cele doua greseli firesti costa amandoua si niciuna nu da eroare:
   *   Number("16,28")     -> NaN
   *   parseFloat("16,28") -> 16, adica 28 de bani pierduti pe fiecare comanda.
   */
  assert.equal(parseazaPretRo("16,28"), 16.28);
  assert.ok(Number.isNaN(Number("16,28")), "asa ar fi iesit cu Number");
  assert.equal(parseFloat("16,28"), 16, "asa ar fi iesit cu parseFloat");
});

test("⚠ punctul de mii se sterge INAINTE de virgula", () => {
  /*
   * Inlocuind doar virgula, „1.016,28" ar deveni „1.016.28", iar `parseFloat` ar
   * da 1,016 lei in loc de 1016,28 — o mie de lei pierduti pe o singura comanda.
   */
  assert.equal(parseazaPretRo("1.016,28"), 1016.28);
  assert.equal(parseazaPretRo("12.345,60"), 12345.6);
});

test("formele simple trec si ele", () => {
  assert.equal(parseazaPretRo("19"), 19);
  assert.equal(parseazaPretRo("19.37"), 19.37, "punctul singur ramane zecimal daca nu e virgula");
  assert.equal(parseazaPretRo(" 21,77 "), 21.77);
  assert.equal(parseazaPretRo(16.28), 16.28, "si un numar adevarat, daca vreodata schimba formatul");
});

test("⚠ ce nu se poate citi da null, NICIODATA zero", () => {
  /*
   * Un pret zero e o livrare gratuita pe care n-a hotarat-o nimeni. `null` face
   * oferta sa dispara din lista — vizibil; zero ar fi trecut nebagat in seama.
   */
  for (const v of ["", "  ", "gratis", "16,28 lei", "N/A", null, undefined, {}, [], NaN]) {
    assert.equal(parseazaPretRo(v as unknown), null, JSON.stringify(v));
  }
});

test("un pret negativ nu e un pret", () => {
  assert.equal(parseazaPretRo("-5,00"), null);
  assert.equal(parseazaPretRo(-5), null);
});

// ─── Ofertele ─────────────────────────────────────────────────────────────────

function serviciu(slug: string, curier: string, nume: string, status = true): ServiciuEcolet {
  return {
    id: 1, slug, name: nume, full_name: nume, status,
    courier: { id: 1, slug: curier.toLowerCase(), name: curier, status: true },
  };
}

const CATALOG = [
  serviciu("dpd_standard", "DPD", "DPD Standard"),
  serviciu("sameday_express", "Sameday", "Sameday Express"),
  serviciu("fan_standard", "FAN Courier", "FAN Courier Standard"),
];

function raspuns(peste: Partial<NonNullable<RaspunsCotare["form"]>> = {}): RaspunsCotare {
  return {
    form: {
      statuses: { dpd_standard: true, sameday_express: true },
      prices_gross: { dpd_standard: "19,37", sameday_express: "21,77" },
      additional_services: { dpd_standard: { cod: true }, sameday_express: { cod: false } },
      ...peste,
    },
  };
}

test("ofertele ies cu pret, curier si serviciu, sortate dupa pret", () => {
  const o = ofertePosibile(raspuns(), CATALOG);
  assert.equal(o.length, 2);
  assert.equal(o[0].slug, "dpd_standard");
  assert.equal(o[0].pret, 19.37);
  assert.equal(o[0].numeCurier, "DPD");
  assert.equal(o[1].pret, 21.77, "sortate crescator");
});

test("⚠ o eroare pe comanda opreste TOATE ofertele", () => {
  /*
   * `form.errors` sunt erorile care fac expedierea imposibila, indexate pe CAMP.
   * Aratate ca oferte, cumparatorul ar plati un transport respins la emitere.
   */
  const o = ofertePosibile(
    raspuns({ errors: { "courier.pickup.type": ["Order without pickup is not available."] } }),
    CATALOG,
  );
  assert.deepEqual(o, []);
});

test("⚠ un pret existent NU inseamna serviciu disponibil", () => {
  /*
   * `statuses` si `prices_gross` sunt obiecte PARALELE si pot sa nu se acopere.
   * Hotaraste `statuses`.
   */
  const o = ofertePosibile(
    raspuns({ statuses: { dpd_standard: false, sameday_express: true } }),
    CATALOG,
  );
  assert.equal(o.length, 1);
  assert.equal(o[0].slug, "sameday_express");
});

test("un serviciu fara pret citibil nu se arata", () => {
  const o = ofertePosibile(
    raspuns({ prices_gross: { dpd_standard: "aiurea", sameday_express: "21,77" } }),
    CATALOG,
  );
  assert.equal(o.length, 1);
  assert.equal(o[0].slug, "sameday_express");
});

test("un serviciu care nu e in catalogul contului nu se arata", () => {
  /* eColet poate cota un serviciu pe care contul nu-l are pornit. */
  const o = ofertePosibile(
    raspuns({ statuses: { dpd_standard: true, curier_necunoscut: true },
              prices_gross: { dpd_standard: "19,37", curier_necunoscut: "5,00" } }),
    CATALOG,
  );
  assert.equal(o.length, 1);
  assert.equal(o[0].slug, "dpd_standard");
});

test("un serviciu oprit in catalog nu se arata", () => {
  const catalogCuOprit = [serviciu("dpd_standard", "DPD", "DPD Standard", false), CATALOG[1]];
  const o = ofertePosibile(raspuns(), catalogCuOprit);
  assert.equal(o.length, 1);
  assert.equal(o[0].slug, "sameday_express");
});

test("comerciantul poate ingusta lista de servicii", () => {
  const o = ofertePosibile(raspuns(), CATALOG, ["sameday_express"]);
  assert.equal(o.length, 1);
  assert.equal(o[0].slug, "sameday_express");
});

test("o lista de servicii permise GOALA inseamna toate, nu niciuna", () => {
  assert.equal(ofertePosibile(raspuns(), CATALOG, []).length, 2);
  assert.equal(ofertePosibile(raspuns(), CATALOG, undefined).length, 2);
});

test("⚠ rambursul se citeste PER SERVICIU, pentru comanda asta", () => {
  /*
   * `conditions.has_cod` din catalog spune ce poate serviciul in general;
   * `additional_services[slug].cod` spune ce poate pentru comanda ASTA — o suma
   * prea mare sau o destinatie anume il pot inchide. A doua e cea adevarata.
   */
  const o = ofertePosibile(raspuns(), CATALOG);
  assert.equal(o.find((x) => x.slug === "dpd_standard")?.acceptaRamburs, true);
  assert.equal(o.find((x) => x.slug === "sameday_express")?.acceptaRamburs, false);
});

test("rambursul lipsa din raspuns inseamna NU, nu „poate”", () => {
  const o = ofertePosibile(raspuns({ additional_services: {} }), CATALOG);
  assert.ok(o.every((x) => x.acceptaRamburs === false));
});

test("un raspuns fara `form` nu produce oferte si nu arunca", () => {
  assert.deepEqual(ofertePosibile({}, CATALOG), []);
  assert.deepEqual(ofertePosibile({ form: {} }, CATALOG), []);
});

// ─── Eticheta ─────────────────────────────────────────────────────────────────

test("⚠ eticheta arata CURIERUL REAL, nu brokerul", () => {
  /* Cumparatorul vrea sa stie cine ii aduce coletul; „eColet" nu-i spune nimic. */
  assert.equal(
    etichetaOferta({ slug: "x", numeCurier: "DPD", numeServiciu: "DPD Standard", pret: 1, acceptaRamburs: true }),
    "DPD Standard",
    "numele serviciului contine deja curierul: nu se repeta",
  );
  assert.equal(
    etichetaOferta({ slug: "x", numeCurier: "Sameday", numeServiciu: "Express", pret: 1, acceptaRamburs: true }),
    "Sameday Express",
  );
  assert.equal(
    etichetaOferta({ slug: "x", numeCurier: "FAN Courier", numeServiciu: "", pret: 1, acceptaRamburs: true }),
    "FAN Courier",
  );
});
