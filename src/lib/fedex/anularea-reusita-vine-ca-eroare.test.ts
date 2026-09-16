import { strict as assert } from "node:assert";
import { test, describe, beforeEach } from "node:test";
import { anuleaza, uitaTokenurile, type FedexConfig } from "./client";
import { ofertePosibile } from "./preturi";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * O ANULARE REUSITA CARE SOSESTE PE CANALUL DE ERORI         (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * In `Ship-Common-ErrorMapping.json` sunt TREI coduri care inseamna „s-a anulat", si toate
 * trei vin in `errors[]`, adica prin `catch`:
 *
 *   CANCELSHIPMENT.TRACKINGNUMBER.DELETED      „already deleted"
 *   MASTERTRACKINGID.TRACKINGNUMBER.CANCELLED  „Tracking number already cancelled"
 *   SHIPMENT.CANCELEDWITHOUTPICKUP.SUCCESS     „has been successfully canceled"
 *
 * ⚠ Al treilea e cel care costa: propozitia lor spune ca anularea a REUSIT, dar fiindca
 * soseste ca eroare, comerciantul afla ca a picat — pe o expediere pe care FedEx tocmai o
 * anulase. Comanda ramane cu un AWB mort si cu un buton care nu mai are ce face.
 *
 * ⚠ Si perechea negativa NU are voie sa fie inghitita:
 * `SHIPMENT.CANCELEDWITHOUTPICKUP.FAILURE` e un esec adevarat.
 */

const CONFIG: FedexConfig = {
  enabled: true,
  client_id: "cheie",
  client_secret: "secret",
  account_number: "613902139",
  expeditor: { nume: "D", telefon: "0721000111", strada: "Str. A 1", oras: "Cluj-Napoca", cod_postal: "400001" },
};

function retea(raspunde: (url: string) => Response) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (intrare: unknown) => {
    const url = String(typeof intrare === "string" ? intrare : (intrare as { url?: string })?.url ?? "");
    return raspunde(url);
  }) as unknown as typeof globalThis.fetch;
  return { restaureaza: () => { globalThis.fetch = original; } };
}

const json = (corp: unknown, status = 200) =>
  new Response(JSON.stringify(corp), { status, headers: { "Content-Type": "application/json" } });

const cuCod = (cod: string, mesaj: string) =>
  retea((url) => url.includes("/oauth/token")
    ? json({ access_token: "t", expires_in: 3600 })
    : json({ errors: [{ code: cod, message: mesaj }] }));

beforeEach(() => uitaTokenurile());

describe("FedEx: cele trei coduri care inseamna „s-a anulat”", () => {
  test("„already deleted” => anulat, si se stie ca ERA deja", async () => {
    const r = cuCod("CANCELSHIPMENT.TRACKINGNUMBER.DELETED", "already deleted");
    try {
      const rez = await anuleaza(CONFIG, "794600000001");
      assert.equal(rez.anulat, true);
      assert.equal(rez.eraDejaAnulat, true);
    } finally { r.restaureaza(); }
  });

  test("⚠ al doilea nume al aceluiasi lucru: `MASTERTRACKINGID...CANCELLED`", async () => {
    const r = cuCod("MASTERTRACKINGID.TRACKINGNUMBER.CANCELLED", "Tracking number already cancelled.");
    try {
      const rez = await anuleaza(CONFIG, "794600000001");
      assert.equal(rez.anulat, true, "al doilea cod al lor nu e recunoscut");
      assert.equal(rez.eraDejaAnulat, true);
    } finally { r.restaureaza(); }
  });

  test("⚠⚠ `CANCELEDWITHOUTPICKUP.SUCCESS` e o REUSITA, nu un esec", async () => {
    const r = cuCod("SHIPMENT.CANCELEDWITHOUTPICKUP.SUCCESS", "The shipment has been successfully canceled without pickup.");
    try {
      const rez = await anuleaza(CONFIG, "794600000001");
      assert.equal(rez.anulat, true, "o anulare reusita e raportata ca esec");
      /* Nu „era deja": am anulat-o ACUM. */
      assert.equal(rez.eraDejaAnulat, false);
    } finally { r.restaureaza(); }
  });

  test("⚠ dar perechea NEGATIVA ramane esec: `CANCELEDWITHOUTPICKUP.FAILURE`", async () => {
    const r = cuCod("SHIPMENT.CANCELEDWITHOUTPICKUP.FAILURE", "The shipment can't be canceled.");
    try {
      await assert.rejects(
        () => anuleaza(CONFIG, "794600000001"),
        "un esec adevarat a fost inghitit ca reusita",
      );
    } finally { r.restaureaza(); }
  });

  test("si un cod necunoscut tot esec ramane", async () => {
    const r = cuCod("SOMETHING.NEW", "ceva neasteptat");
    try {
      await assert.rejects(() => anuleaza(CONFIG, "794600000001"));
    } finally { r.restaureaza(); }
  });
});

describe("FedEx: zilele de tranzit se citesc din numele enumerarii", () => {
  /*
   * Enumerarea lor (`CommitDetail.daysInTransit`) are 22 de valori, pana la `TWENTY_DAYS`.
   * Tabelul scris de mana se oprea la `TEN_DAYS`, deci pentru expedierile internationale —
   * exact acolo unde cumparatorul chiar vrea sa stie — nu se arata nimic.
   */
  const oferta = (zile: string) => ofertePosibile(
    [{
      serviceType: "FEDEX_INTERNATIONAL_PRIORITY",
      serviceName: "FedEx International Priority",
      commit: { daysInTransit: zile },
      ratedShipmentDetails: [{
        rateType: "ACCOUNT",
        totalNetCharge: 100,
        shipmentRateDetail: { currency: "RON" },
      }],
    }] as never,
  ).oferte[0];

  test("cele pe care le stia si tabelul vechi", () => {
    assert.equal(oferta("ONE_DAY")?.tranzit, "o zi lucratoare");
    assert.equal(oferta("TEN_DAYS")?.tranzit, "10 zile lucratoare");
  });

  test("⚠ si cele unsprezece pe care nu le stia", () => {
    assert.equal(oferta("ELEVEN_DAYS")?.tranzit, "11 zile lucratoare");
    assert.equal(oferta("FIFTEEN_DAYS")?.tranzit, "15 zile lucratoare");
    assert.equal(oferta("TWENTY_DAYS")?.tranzit, "20 zile lucratoare");
  });

  test("⚠ dar ce NU e un numar de zile nu se inventeaza", () => {
    /* `UNKNOWN` inseamna, la ei, chiar „nu stiu"; `SMARTPOST_TRANSIT_DAYS` e un serviciu
       american. Amandoua raman fara text, ceea ce e purtarea cinstita. */
    assert.equal(oferta("UNKNOWN")?.tranzit, null);
    assert.equal(oferta("SMARTPOST_TRANSIT_DAYS")?.tranzit, null);
    assert.equal(oferta("CEVA_NOU_DAYS")?.tranzit, null);
  });
});
