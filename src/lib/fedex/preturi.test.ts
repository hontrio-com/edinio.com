import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { cheiaOfertei, etichetaOferta, ofertePosibile, VALUTA } from "./preturi";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Aici se hotaraste ce vede cumparatorul si pe ce plateste. Doua lucruri pot merge
 * prost tacut:
 *
 *  1. UN PRET IN ALTA VALUTA. `totalNetCharge` e un numar simplu, iar valuta sta in
 *     alta parte a raspunsului. Un cont care coteaza in EUR intoarce „12", si 12
 *     euro scrisi pe o comanda romaneasca devin 12 lei — o subfacturare de cinci
 *     ori, pe transport real platit de comerciant.
 *
 *  2. TARIFUL DE LISTA IN LOC DE CEL NEGOCIAT. `ratedShipmentDetails` e un tablou
 *     cu cate o intrare pe tip de tarif, iar ordinea NU e garantata nicaieri in
 *     documentatia lor. Luata `[0]` orbeste, oferta poate fi pretul de lista.
 */

/** Un serviciu din `rateReplyDetails[]`, in forma lor. */
function serviciu(
  serviceType: string,
  intrari: { pret: number; valuta?: string; tip?: string }[],
  optiuni: { serviceName?: string; tranzit?: string } = {},
) {
  return {
    serviceType,
    serviceName: optiuni.serviceName ?? serviceType,
    ratedShipmentDetails: intrari.map((i) => ({
      rateType: i.tip ?? "ACCOUNT",
      totalNetCharge: i.pret,
      shipmentRateDetail: { currency: i.valuta ?? "RON" },
    })),
    ...(optiuni.tranzit
      ? { commit: { transitDays: { description: optiuni.tranzit } } }
      : {}),
  };
}

describe("FedEx: valuta", () => {
  test("⚠ o oferta care nu vine in lei se ARUNCA, nu se converteste", () => {
    const r = ofertePosibile([serviciu("FEDEX_PRIORITY", [{ pret: 12, valuta: "EUR" }])]);
    assert.equal(r.oferte.length, 0);
    assert.deepEqual(r.valuteRefuzate, ["EUR"]);
  });

  test("motivul ajunge la comerciant, nu se pierde in tacere", () => {
    const r = ofertePosibile([
      serviciu("FEDEX_PRIORITY", [{ pret: 12, valuta: "EUR" }]),
      serviciu("FEDEX_FIRST", [{ pret: 40, valuta: "USD" }]),
    ]);
    assert.equal(r.oferte.length, 0);
    assert.deepEqual([...r.valuteRefuzate].sort(), ["EUR", "USD"]);
  });

  test("in lei trece, si isi poarta valuta", () => {
    const r = ofertePosibile([serviciu("FEDEX_PRIORITY", [{ pret: 34.5 }])]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 34.5);
    assert.equal(r.oferte[0].valuta, VALUTA);
  });

  test("⚠ intrarea in lei bate intrarea in euro, chiar daca euro e prima si e ACCOUNT", () => {
    // O intrare `ACCOUNT` in euro e mai periculoasa decat una `LIST` in lei: prima ar
    // scrie un numar gresit pe comanda, a doua doar un pret mai mare decat trebuie.
    const r = ofertePosibile([
      serviciu("FEDEX_PRIORITY", [
        { pret: 12, valuta: "EUR", tip: "ACCOUNT" },
        { pret: 60, valuta: "RON", tip: "LIST" },
      ]),
    ]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 60);
    assert.equal(r.oferte[0].valuta, "RON");
  });
});

describe("FedEx: care tarif se ia", () => {
  test("⚠ ACCOUNT, chiar cand LIST e primul in tablou", () => {
    const r = ofertePosibile([
      serviciu("FEDEX_PRIORITY", [
        { pret: 99, tip: "LIST" },
        { pret: 61, tip: "ACCOUNT" },
      ]),
    ]);
    assert.equal(r.oferte[0].pret, 61);
    assert.equal(r.oferte[0].tipTarif, "ACCOUNT");
  });

  test("fara ACCOUNT se cade pe valuta preferata, apoi pe lista", () => {
    const r = ofertePosibile([
      serviciu("FEDEX_PRIORITY", [
        { pret: 99, tip: "LIST" },
        { pret: 70, tip: "PREFERRED_CURRENCY" },
      ]),
    ]);
    assert.equal(r.oferte[0].pret, 70);
  });

  test("un cont fara tarife negociate se semnaleaza", () => {
    const r = ofertePosibile([serviciu("FEDEX_PRIORITY", [{ pret: 99, tip: "LIST" }])]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.doarPretDeLista, true);
  });

  test("cu tarif de cont, semnalul e stins", () => {
    const r = ofertePosibile([serviciu("FEDEX_PRIORITY", [{ pret: 61, tip: "ACCOUNT" }])]);
    assert.equal(r.doarPretDeLista, false);
  });

  test("zero sau lipsa NU inseamna gratuit — inseamna necotat", () => {
    assert.equal(ofertePosibile([serviciu("FEDEX_PRIORITY", [{ pret: 0 }])]).oferte.length, 0);
    assert.equal(
      ofertePosibile([{ serviceType: "FEDEX_PRIORITY", ratedShipmentDetails: [{ rateType: "ACCOUNT" }] }]).oferte.length,
      0,
    );
  });
});

describe("FedEx: rambursul", () => {
  test("⚠ cu ramburs nu exista NICIO oferta, oricat de bune ar fi tarifele", () => {
    // Nu e o configurare gresita: FedEx a retras C.O.D. in iulie 2023 peste tot in
    // afara de FedEx Ground in/spre Canada.
    const detalii = [serviciu("FEDEX_PRIORITY", [{ pret: 20 }]), serviciu("FEDEX_FIRST", [{ pret: 30 }])];
    assert.equal(ofertePosibile(detalii, undefined, { cuRamburs: true }).oferte.length, 0);
    assert.equal(ofertePosibile(detalii, undefined, { cuRamburs: false }).oferte.length, 2);
  });
});

describe("FedEx: filtrele comerciantului", () => {
  test("lista goala inseamna TOATE, nu niciunul", () => {
    const detalii = [serviciu("FEDEX_PRIORITY", [{ pret: 20 }]), serviciu("FEDEX_FIRST", [{ pret: 30 }])];
    assert.equal(ofertePosibile(detalii, { servicii_permise: [] }).oferte.length, 2);
    assert.equal(ofertePosibile(detalii, {}).oferte.length, 2);
  });

  test("cu servicii alese, restul dispar", () => {
    const detalii = [serviciu("FEDEX_PRIORITY", [{ pret: 20 }]), serviciu("FEDEX_FIRST", [{ pret: 30 }])];
    const r = ofertePosibile(detalii, { servicii_permise: ["FEDEX_FIRST"] });
    assert.deepEqual(r.oferte.map((o) => o.serviceType), ["FEDEX_FIRST"]);
  });

  test("⚠ marfa grea nu se ofera unui cumparator cu un colet de 2 kg", () => {
    const detalii = [
      serviciu("FEDEX_PRIORITY", [{ pret: 20 }]),
      serviciu("FEDEX_PRIORITY_FREIGHT", [{ pret: 300 }]),
    ];
    const usor = ofertePosibile(detalii, undefined, { greutateKg: 2 });
    assert.deepEqual(usor.oferte.map((o) => o.serviceType), ["FEDEX_PRIORITY"]);

    const greu = ofertePosibile(detalii, undefined, { greutateKg: 120 });
    assert.equal(greu.oferte.length, 2);
  });
});

describe("FedEx: asezarea si numele", () => {
  test("ordinea e dupa pret", () => {
    const r = ofertePosibile([
      serviciu("FEDEX_FIRST", [{ pret: 90 }]),
      serviciu("FEDEX_PRIORITY", [{ pret: 40 }]),
      serviciu("FEDEX_PRIORITY_EXPRESS", [{ pret: 65 }]),
    ]);
    assert.deepEqual(r.oferte.map((o) => o.pret), [40, 65, 90]);
  });

  test("acelasi serviciu nu apare de doua ori", () => {
    const r = ofertePosibile([
      serviciu("FEDEX_PRIORITY", [{ pret: 40 }]),
      serviciu("FEDEX_PRIORITY", [{ pret: 55 }]),
    ]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 40);
  });

  test("cheia ofertei e serviciul", () => {
    assert.equal(cheiaOfertei({ serviceType: "FEDEX_PRIORITY" }), "FEDEX_PRIORITY");
    assert.notEqual(cheiaOfertei({ serviceType: "FEDEX_FIRST" }), cheiaOfertei({ serviceType: "FEDEX_PRIORITY" }));
  });

  test("eticheta poarta si timpul de tranzit cand FedEx il da", () => {
    const r = ofertePosibile([serviciu("FEDEX_PRIORITY", [{ pret: 40 }], { tranzit: "1-2 Business Days" })]);
    assert.equal(r.oferte[0].tranzit, "1-2 Business Days");
    assert.ok(etichetaOferta(r.oferte[0]).includes("1-2 Business Days"));
  });

  test("fara tranzit, eticheta ramane doar numele", () => {
    const r = ofertePosibile([serviciu("FEDEX_PRIORITY", [{ pret: 40 }])]);
    assert.equal(r.oferte[0].tranzit, null);
    assert.equal(etichetaOferta(r.oferte[0]), r.oferte[0].serviceName);
  });

  test("tranzitul se poate citi si din enumerare, si din operationalDetail", () => {
    const dinCommit = ofertePosibile([{
      serviceType: "FEDEX_PRIORITY",
      ratedShipmentDetails: [{ rateType: "ACCOUNT", totalNetCharge: 10, shipmentRateDetail: { currency: "RON" } }],
      commit: { daysInTransit: "TWO_DAYS" },
    }]);
    assert.equal(dinCommit.oferte[0].tranzit, "2 zile lucratoare");

    const dinOperational = ofertePosibile([{
      serviceType: "FEDEX_PRIORITY",
      ratedShipmentDetails: [{ rateType: "ACCOUNT", totalNetCharge: 10, shipmentRateDetail: { currency: "RON" } }],
      operationalDetail: { transitTime: "THREE_DAYS" },
    }]);
    assert.equal(dinOperational.oferte[0].tranzit, "3 zile lucratoare");
  });

  test("⚠ valuta se citeste si din campul NEDOCUMENTAT, cand cel documentat lipseste", () => {
    // `ratedShipmentDetails[].currency` apare in raspunsuri reale dar nu e in schema.
    const r = ofertePosibile([{
      serviceType: "FEDEX_PRIORITY",
      ratedShipmentDetails: [{ rateType: "ACCOUNT", totalNetCharge: 25, currency: "RON" }],
    }]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 25);
  });
});

describe("FedEx: raspunsuri stricate", () => {
  test("lista goala sau gunoi nu arunca", () => {
    assert.equal(ofertePosibile([]).oferte.length, 0);
    assert.equal(ofertePosibile([null, undefined, 42, "text"] as unknown[]).oferte.length, 0);
    assert.equal(ofertePosibile([{ serviceType: "" }]).oferte.length, 0);
    assert.equal(ofertePosibile([{ serviceType: "FEDEX_PRIORITY" }]).oferte.length, 0);
  });
});
