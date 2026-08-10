import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  areEtichete,
  eroriPeColet,
  numereColet,
  pdfDinEtichete,
  urlMetoda,
  TARI_MYGLS,
  type RaspunsEtichete,
} from "./client";

/*
 * ⚠ Integrarea se probeaza DIRECT IN PRODUCTIE, pe contractul unui client real.
 * Tot ce se poate verifica fara retea se verifica aici — pentru ca urmatoarea
 * ocazie e un colet adevarat, facturat.
 *
 * Ce NU se poate acoperi aici: raspunsul real al MyGLS. De aia probele de mai
 * jos lucreaza pe FORMA raspunsului, luata din integrarea WooCommerce care merge
 * in productie, nu pe presupuneri.
 */

const CFG = { tara: "RO" as const, sandbox: false };

test("adresa metodei se compune din tara si mediu", () => {
  assert.equal(
    urlMetoda(CFG, "PrintLabels"),
    "https://api.mygls.ro/ParcelService.svc/json/PrintLabels",
  );
  assert.equal(
    urlMetoda({ tara: "RO", sandbox: true }, "PrintLabels"),
    "https://api.test.mygls.ro/ParcelService.svc/json/PrintLabels",
  );
});

test("⚠ mediul de test si productia difera printr-un singur cuvant", () => {
  /*
   * `api.mygls.ro` vs `api.test.mygls.ro`. O greseala aici inseamna colete reale
   * emise cand credeai ca testezi — sau invers, teste care nu ajung nicaieri.
   * Proba tine cele doua forme separate explicit.
   */
  const prod = urlMetoda({ tara: "RO", sandbox: false }, "PrintLabels");
  const test_ = urlMetoda({ tara: "RO", sandbox: true }, "PrintLabels");
  assert.notEqual(prod, test_);
  assert.ok(prod.startsWith("https://api.mygls."), "productia nu are cuvantul test");
  assert.ok(test_.includes("api.test.mygls."), "mediul de test are cuvantul test");
});

test("codul de tara intra cu litere mici in subdomeniu", () => {
  /* Configurarea tine „RO" cu majuscule (asa e in ISO si in restul aplicatiei),
     dar gazda e `api.mygls.ro`. */
  for (const tara of TARI_MYGLS) {
    const url = urlMetoda({ tara, sandbox: false }, "PrintLabels");
    assert.ok(url.includes(`mygls.${tara.toLowerCase()}`), `${tara}: ${url}`);
    assert.ok(!url.includes(tara), `${tara} n-ar trebui sa apara cu majuscule in ${url}`);
  }
});

test("MyGLS raspunde in cele sapte tari in care are contracte", () => {
  assert.deepEqual([...TARI_MYGLS], ["CZ", "HR", "HU", "RO", "SI", "SK", "RS"]);
  assert.ok(TARI_MYGLS.includes("RO"));
});

test("se poate cere si alt serviciu decat ParcelService", () => {
  assert.equal(
    urlMetoda(CFG, "GetPickupRequest", "PickupService"),
    "https://api.mygls.ro/PickupService.svc/json/GetPickupRequest",
  );
});

test("⚠ eticheta e o lista de OCTETI, nu un sir", () => {
  /*
   * `Labels` vine ca tablou de numere. Tratat ca text, iese un PDF corupt care
   * se deschide gol — si afli abia cand curierul refuza coletul.
   *
   * „%PDF-1.4" in octeti, ca sa se vada ca reconstructia da chiar un PDF.
   */
  const octeti = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
  const pdf = pdfDinEtichete({ Labels: octeti });
  assert.ok(pdf, "nu s-a construit PDF-ul");
  assert.equal(pdf.length, 8);
  assert.equal(pdf.subarray(0, 4).toString("latin1"), "%PDF");
});

test("octetii peste 127 supravietuiesc — un PDF nu e text", () => {
  /* Daca undeva pe drum s-ar face o conversie prin sir UTF-8, octetii mari s-ar
     transforma in doi octeti si fisierul ar iesi mai lung si stricat. */
  const octeti = [0, 1, 127, 128, 200, 255];
  const pdf = pdfDinEtichete({ Labels: octeti });
  assert.ok(pdf);
  assert.equal(pdf.length, 6);
  assert.deepEqual([...pdf], octeti);
});

test("fara etichete nu se inventeaza un fisier gol", () => {
  /* Un PDF de zero octeti salvat pe disc arata ca un succes si nu e. */
  assert.equal(pdfDinEtichete({}), null);
  assert.equal(pdfDinEtichete({ Labels: [] }), null);
  assert.equal(areEtichete({}), false);
  assert.equal(areEtichete({ Labels: [] }), false);
  assert.equal(areEtichete({ Labels: [1] }), true);
});

test("se pastreaza ParcelNumber, nu ParcelId", () => {
  /*
   * MyGLS intoarce amandoua. `ParcelId` e intern la ei; `ParcelNumber` e cel de
   * pe eticheta si cel pe care il urmareste clientul. Salvat gresit, clientul
   * primeste un numar care nu se gaseste in tracking.
   */
  const r: RaspunsEtichete = {
    PrintLabelsInfoList: [
      { ParcelId: 111, ParcelNumber: 999888777, ClientReference: "CMD-1" },
      { ParcelId: 222, ParcelNumber: 999888778, ClientReference: "CMD-1" },
    ],
  };
  assert.deepEqual(numereColet(r), ["999888777", "999888778"]);
});

test("un colet fara numar nu produce „undefined” in lista de AWB-uri", () => {
  const r: RaspunsEtichete = {
    PrintLabelsInfoList: [{ ParcelId: 1 }, { ParcelNumber: 5 }, {}],
  };
  assert.deepEqual(numereColet(r), ["5"]);
  assert.deepEqual(numereColet({}), []);
});

test("erorile pe colet se citesc cu referinta comenzii", () => {
  /*
   * La un lot, unele colete trec si altele nu. Fara referinta in mesaj,
   * comerciantul vede „adresa invalida" si nu stie la care comanda.
   */
  const r: RaspunsEtichete = {
    PrintLabelsErrorList: [
      { ErrorCode: 12, ErrorDescription: "Adresa invalida", ClientReferenceList: ["CMD-7"] },
      { ErrorCode: 33 },
    ],
  };
  assert.deepEqual(eroriPeColet(r), ["Adresa invalida (CMD-7)", "eroare 33"]);
  assert.deepEqual(eroriPeColet({}), []);
});

test("⚠ un raspuns poate avea SI etichete, SI erori", () => {
  /*
   * Cazul care se pierde usor: la un lot de zece comenzi, opt reusesc si doua
   * pica. Daca la prima eroare am arunca tot, cele opt etichete emise (si
   * facturate) s-ar pierde, iar comerciantul ar reincerca — emitand inca opt.
   */
  const r: RaspunsEtichete = {
    Labels: [0x25, 0x50, 0x44, 0x46],
    PrintLabelsInfoList: [{ ParcelNumber: 1234 }],
    PrintLabelsErrorList: [{ ErrorCode: 9, ErrorDescription: "Cod postal lipsa" }],
  };
  assert.ok(areEtichete(r), "etichetele exista");
  assert.deepEqual(numereColet(r), ["1234"]);
  assert.equal(eroriPeColet(r).length, 1);
});
