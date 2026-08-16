import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { cheiaOfertei, etichetaOferta, explicatieTva, ofertePosibile, VALUTA } from "./preturi";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Aici se hotaraste ce vede cumparatorul si pe ce plateste. Patru lucruri pot merge
 * prost tacut:
 *
 *  1. UN PRET IN ALTA VALUTA. UPS **nu are niciun camp prin care sa ceri valuta**
 *     raspunsului (cautat in tot `Rating.yaml`). Un cont care coteaza in EUR
 *     intoarce „12", si 12 euro scrisi pe o comanda romaneasca devin 12 lei — o
 *     subfacturare de cinci ori, pe transport real platit de comerciant.
 *
 *  2. TARIFUL DE LISTA IN LOC DE CEL NEGOCIAT. Cele doua se numesc aproape la fel:
 *     `NegotiatedRateCharges.TotalCharge` (SINGULAR) si `TotalCharges` (PLURAL).
 *     Citit gresit, comerciantul incaseaza pretul de lista si plateste altul.
 *
 *  3. UN SERVICIU CARE NU MERGE PE RUTA. `11 UPS Standard` si `54 Express Plus` nu
 *     sunt disponibile intern in Romania („Nu este disponibil pentru expedieri
 *     interne", scris de doua ori in ghidul lor romanesc). Aratate in checkout, ele
 *     ar fi platite si apoi ar cadea la emitere.
 *
 *  4. TVA-UL PRESUPUS. UPS nu spune nicaieri daca `TotalCharges` include TVA.
 */

/** Un `RatedShipment` in forma lor. */
function oferta(
  cod: string,
  optiuni: {
    lista?: number;
    negociat?: number;
    valuta?: string;
    cuTva?: number;
    taxe?: number[];
    taxeNegociat?: number[];
    zile?: number;
    nume?: string;
    alerta?: { Code: string; Description: string };
  } = {},
) {
  const valuta = optiuni.valuta ?? "RON";
  const o: Record<string, unknown> = {
    Service: { Code: cod, Description: optiuni.nume ?? "" },
  };
  if (optiuni.lista !== undefined) {
    o.TotalCharges = { CurrencyCode: valuta, MonetaryValue: String(optiuni.lista) };
  }
  if (optiuni.negociat !== undefined) {
    const n: Record<string, unknown> = {
      TotalCharge: { CurrencyCode: valuta, MonetaryValue: String(optiuni.negociat) },
    };
    if (optiuni.cuTva !== undefined) {
      n.TotalChargesWithTaxes = { CurrencyCode: valuta, MonetaryValue: String(optiuni.cuTva) };
    }
    if (optiuni.taxeNegociat) {
      n.TaxCharges = optiuni.taxeNegociat.map((v) => ({ Type: "VAT", MonetaryValue: String(v) }));
    }
    o.NegotiatedRateCharges = n;
  } else if (optiuni.cuTva !== undefined) {
    o.TotalChargesWithTaxes = { CurrencyCode: valuta, MonetaryValue: String(optiuni.cuTva) };
  }
  if (optiuni.taxe) {
    o.TaxCharges = optiuni.taxe.map((v) => ({ Type: "VAT", MonetaryValue: String(v) }));
  }
  if (optiuni.zile !== undefined) {
    o.TimeInTransit = { ServiceSummary: { EstimatedArrival: { BusinessDaysInTransit: String(optiuni.zile) } } };
  }
  if (optiuni.alerta) o.RatedShipmentAlert = [optiuni.alerta];
  return o;
}

describe("UPS: valuta", () => {
  test("⚠ o oferta care nu vine in lei se ARUNCA, nu se converteste", () => {
    const r = ofertePosibile([oferta("07", { lista: 12, valuta: "EUR" })]);
    assert.equal(r.oferte.length, 0);
    assert.deepEqual(r.valuteRefuzate, ["EUR"]);
  });

  test("motivul ajunge la comerciant, nu se pierde in tacere", () => {
    const r = ofertePosibile([
      oferta("07", { lista: 12, valuta: "EUR" }),
      oferta("65", { lista: 40, valuta: "USD" }),
    ]);
    assert.equal(r.oferte.length, 0);
    assert.deepEqual([...r.valuteRefuzate].sort(), ["EUR", "USD"]);
  });

  test("in lei trece, si isi poarta valuta", () => {
    const r = ofertePosibile([oferta("07", { lista: 34.5 })]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 34.5);
    assert.equal(r.oferte[0].valuta, VALUTA);
  });
});

describe("UPS: tariful contractului bate pretul de lista", () => {
  test("⚠ `TotalCharge` (singular) se ia inaintea lui `TotalCharges` (plural)", () => {
    const r = ofertePosibile([oferta("07", { lista: 100, negociat: 72.4 })]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 72.4);
    assert.equal(r.oferte[0].negociat, true);
    assert.equal(r.doarPretDeLista, false);
  });

  test("fara containerul negociat se cade pe lista, si se SEMNALEAZA", () => {
    const r = ofertePosibile([oferta("07", { lista: 100 }), oferta("65", { lista: 80 })]);
    assert.equal(r.oferte.length, 2);
    assert.equal(r.oferte.every((o) => !o.negociat), true);
    assert.equal(r.doarPretDeLista, true);
  });

  test("cand macar una e negociata, nu se mai spune „doar lista”", () => {
    const r = ofertePosibile([oferta("07", { lista: 100, negociat: 72 }), oferta("65", { lista: 80 })]);
    assert.equal(r.doarPretDeLista, false);
  });

  test("o suma de zero nu e o oferta gratuita — se sare", () => {
    const r = ofertePosibile([oferta("07", { lista: 0 })]);
    assert.equal(r.oferte.length, 0);
  });
});

describe("UPS: ce servicii se pot arata", () => {
  /*
   * ⚠⚠ AICI E CORECTIA CEA MAI IMPORTANTA DIN TOATA INTEGRAREA.
   *
   * Prima varianta filtra ofertele dupa tabelul nostru de rute romanesti: `11 UPS
   * Standard` si `54 Express Plus` erau scoase din checkout la comenzile interne,
   * fiindca ghidul comercial al UPS scrie „Nu este disponibil pentru expedieri interne".
   *
   * E gresit. `Shop` e descris de ei „The server **validates the shipment**, and returns
   * rates for **all UPS products from the ShipFrom to the ShipTo addresses**" — deci UPS
   * a filtrat deja, pe contul real al comerciantului. Ce a intors el, el il vinde.
   * Ascuns de noi, cumparatorul ar fi platit varianta mai scumpa fara niciun motiv, iar
   * comerciantul n-ar fi aflat niciodata de ce.
   *
   * Ce ramane: se SPUNE, prin `neVanduteInRomania`.
   */
  test("⚠ `11 UPS Standard` intern NU se ascunde — daca UPS l-a cotat, UPS il vinde", () => {
    const r = ofertePosibile(
      [oferta("11", { lista: 20 }), oferta("07", { lista: 45 })],
      undefined,
      { taraExpeditor: "RO", taraDestinatar: "RO" },
    );
    assert.deepEqual(r.oferte.map((o) => o.serviceCode), ["11", "07"]);
    /* Dar se semnaleaza: ori documentul lor e invechit, ori contul are alt contract. */
    assert.deepEqual(r.neVanduteInRomania, ["11"]);
  });

  test("⚠ `54 Express Plus` la fel: se arata, si se semnaleaza doar intern", () => {
    const intern = ofertePosibile([oferta("54", { lista: 90 })], undefined, { taraExpeditor: "RO", taraDestinatar: "RO" });
    assert.equal(intern.oferte.length, 1);
    assert.deepEqual(intern.neVanduteInRomania, ["54"]);

    const extern = ofertePosibile([oferta("54", { lista: 90 })], undefined, { taraExpeditor: "RO", taraDestinatar: "DE" });
    assert.equal(extern.oferte.length, 1);
    assert.deepEqual(extern.neVanduteInRomania, []);
  });

  test("serviciile pe care ghidul lor le da ca interne nu se semnaleaza", () => {
    const r = ofertePosibile(
      [oferta("07", { lista: 45 }), oferta("65", { lista: 30 })],
      undefined,
      { taraExpeditor: "RO", taraDestinatar: "RO" },
    );
    assert.deepEqual(r.neVanduteInRomania, []);
  });

  test("un cod NECUNOSCUT trece — lista noastra e o traducere, nu o validare", () => {
    const r = ofertePosibile([oferta("ZZ", { lista: 30 })], undefined, { taraExpeditor: "RO", taraDestinatar: "RO" });
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].serviceCode, "ZZ");
  });

  test("filtrul comerciantului: gol inseamna TOATE, nu niciunul", () => {
    const brute = [oferta("07", { lista: 45 }), oferta("65", { lista: 30 })];
    assert.equal(ofertePosibile(brute, { servicii_permise: [] }).oferte.length, 2);
    assert.deepEqual(
      ofertePosibile(brute, { servicii_permise: ["65"] }).oferte.map((o) => o.serviceCode),
      ["65"],
    );
  });

  test("acelasi serviciu intors de doua ori nu se dubleaza", () => {
    const r = ofertePosibile([oferta("07", { lista: 45 }), oferta("07", { lista: 47 })]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 45);
  });

  test("ofertele ies ordonate dupa pret", () => {
    const r = ofertePosibile([oferta("07", { lista: 45 }), oferta("65", { lista: 30 })]);
    assert.deepEqual(r.oferte.map((o) => o.pret), [30, 45]);
  });
});

describe("UPS: TVA-ul se citeste, nu se presupune", () => {
  test("⚠ cand se cer tarife negociate, taxele vin NUMAI sub containerul negociat", () => {
    const r = ofertePosibile([oferta("07", { negociat: 100, cuTva: 119, taxeNegociat: [19] })]);
    assert.equal(r.oferte[0].cuTva, 119);
    assert.equal(r.oferte[0].tva, 19);
    assert.equal(explicatieTva(r.oferte[0]), "+ TVA 19.00 lei (total cu TVA 119.00 lei)");
  });

  test("fara `TotalChargesWithTaxes` nu se afirma nimic despre TVA", () => {
    const r = ofertePosibile([oferta("07", { lista: 100 })]);
    assert.equal(r.oferte[0].cuTva, null);
    assert.equal(explicatieTva(r.oferte[0]), null);
  });

  test("`cuTva` egal cu pretul inseamna „n-au aplicat taxa”, nu „fara TVA”", () => {
    const r = ofertePosibile([oferta("07", { negociat: 100, cuTva: 100 })]);
    assert.equal(explicatieTva(r.oferte[0]), "UPS n-a aplicat TVA pe cotarea asta.");
  });

  test("⚠ un total cu TVA in ALTA valuta decat pretul nu se compara", () => {
    const brut = oferta("07", { negociat: 100 });
    (brut.NegotiatedRateCharges as Record<string, unknown>).TotalChargesWithTaxes = {
      CurrencyCode: "EUR", MonetaryValue: "24",
    };
    const r = ofertePosibile([brut]);
    assert.equal(r.oferte[0].cuTva, null);
  });
});

describe("UPS: tranzit, alerte si cheia ofertei", () => {
  test("zilele de tranzit se traduc in romaneste", () => {
    assert.equal(ofertePosibile([oferta("07", { lista: 45, zile: 1 })]).oferte[0].tranzit, "o zi lucratoare");
    assert.equal(ofertePosibile([oferta("07", { lista: 45, zile: 3 })]).oferte[0].tranzit, "3 zile lucratoare");
  });

  test("fara tranzit, eticheta ramane curata", () => {
    const o = ofertePosibile([oferta("07", { lista: 45 })]).oferte[0];
    assert.equal(o.tranzit, null);
    assert.equal(etichetaOferta(o), "UPS Express — pana la pranz, ziua urmatoare");
  });

  test("⚠ avertismentele PE OFERTA nu se arunca", () => {
    const r = ofertePosibile([
      oferta("07", { lista: 45, alerta: { Code: "120900", Description: "not qualified for negotiated rates" } }),
    ]);
    assert.equal(r.oferte[0].alerte.length, 1);
    assert.equal(r.oferte[0].alerte[0].code, "120900");
  });

  test("cheia ofertei e chiar codul serviciului", () => {
    assert.equal(cheiaOfertei({ serviceCode: "65" }), "65");
  });

  test("un raspuns gol nu crapa si nu inventeaza nimic", () => {
    const r = ofertePosibile([]);
    assert.deepEqual(r.oferte, []);
    assert.equal(r.doarPretDeLista, false);
  });

  test("intrari murdare (null, siruri, numere) se sar", () => {
    const r = ofertePosibile([null, "x", 7, oferta("07", { lista: 45 })] as unknown[]);
    assert.equal(r.oferte.length, 1);
  });
});
