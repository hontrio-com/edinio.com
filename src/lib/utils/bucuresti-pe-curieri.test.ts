import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { adresaGls } from "@/lib/gls/expediere";
import { adresaInnoship } from "@/lib/innoship/expediere";
import { localitatePosta, sectorDinOras } from "@/lib/posta/expediere";
import { localitateSmartship, sectorSmartship } from "@/lib/smartship/localitati";
import { localitateShipo, sectorShipo } from "@/lib/shipo/localitati";
import { orasFedex, parteFedex, sectorPentruAdresa } from "@/lib/fedex/expediere";
import {
  adresaUps, judetUps, orasUps, sectorPentruAdresa as sectorUps,
} from "@/lib/ups/expediere";
import {
  adresaDhl, judetDhl, orasDhl, sectorPentruAdresa as sectorDhl,
} from "@/lib/dhl/expediere";
import { localitateSameday, normalizeLocalityName } from "@/lib/utils/ro-address";

/**
 * ═══ O COMANDA DIN BUCURESTI, PAISPREZECE CURIERI, DOUA ADEVARURI ═══
 *
 * Din 15.08.2026 checkout-ul nu mai lasa orasul liber in Bucuresti: se alege
 * „Sector 1"…„Sector 6". Asta a fost nevoie fiindca Sameday NU cunoaste un oras
 * numit „Bucuresti” — la ei sectoarele SUNT orase, si din zece comenzi
 * bucurestene adevarate noua cadeau la cotatie, tacut, pe pretul din zona.
 *
 * Dar majoritatea celorlalti curieri cer exact pe dos: pentru Cargus, DPD, FAN,
 * GLS, Innoship, Posta, Colete, Pall-Ex si pentru curierii revanduti de Packeta,
 * Bucurestiul e O SINGURA localitate, iar sectorul sta in adresa.
 *
 * Deci aceeasi comanda trebuie sa plece in DOUA forme diferite, si nimic din
 * tsc, build sau probele fiecarui curier in parte nu leaga cele doua reguli
 * intre ele. Fisierul asta o face: daca cineva „uniformizeaza" candva
 * normalizarea, aici cade.
 */

const ADRESA = {
  nume: "Ion Popescu",
  strada: "Calea Victoriei",
  numar: "12",
  oras: "Sector 3",
  judet: "Municipiul Bucuresti",
  codPostal: "030167",
  telefon: "0721000000",
};

describe("Bucuresti: fiecare curier primeste forma LUI", () => {
  test("SAMEDAY primeste sectorul — el nu stie de un oras „Bucuresti”", () => {
    assert.equal(localitateSameday(ADRESA.oras, ADRESA.judet), "Sector 3");
  });

  test("GLS primeste „Bucuresti”", () => {
    assert.equal(adresaGls(ADRESA).City, "Bucuresti");
  });

  test("INNOSHIP primeste „Bucuresti”", () => {
    assert.equal(adresaInnoship(ADRESA, "domiciliu").localityName, "Bucuresti");
  });

  test("POSTA primeste „Bucuresti”, iar sectorul ramane recuperabil", () => {
    assert.equal(localitatePosta(ADRESA.oras), "Bucuresti");
    assert.equal(sectorDinOras(ADRESA.oras), "Sector 3");
  });

  test("SHIPO primeste „Bucuresti”, iar sectorul pleaca in campul lui", () => {
    assert.equal(localitateShipo(ADRESA.oras, ADRESA.judet), "Bucuresti");
    assert.equal(sectorShipo(ADRESA.oras, ADRESA.judet, ADRESA.strada), 3);
  });

  test("SHIPO nu trimite deloc campul de sector in afara Bucurestiului", () => {
    /* ⚠ Deosebire fata de SmartShip, unde acelasi camp cere 0 in restul tarii:
       la Shipo e „Conditionat", deci un zero trimis degeaba ar putea cadea la
       validarea lor („intre 1 si 6") — pentru fiecare comanda din tara. */
    assert.equal(sectorShipo("Cluj-Napoca", "Cluj"), undefined);
    assert.equal(sectorSmartship("Cluj-Napoca", "Cluj"), 0);
  });

  test("CARGUS, DPD si FAN pliaza prin acelasi ajutor", () => {
    assert.equal(normalizeLocalityName(ADRESA.oras, ADRESA.judet), "Bucuresti");
  });

  /*
   * ⚠ FedEx e in tabara CEA MARE, dar fara camp de sector — si asta nu e o scapare.
   *
   * Cautat `sector` in toate paginile lor de documentatie, in toate JSON-urile
   * OpenAPI si in `API_Reference_Guide.json`: singurele aparitii sunt adresa
   * sediului lor din Bucuresti. FedEx NU documenteaza nicio regula de sector, deci
   * nu se inventeaza una — sectorul, care ramane o informatie reala de livrare,
   * pleaca pe adresa, iar codul postal de sase cifre (Romania e „postal-aware" la
   * ei) il identifica oricum.
   *
   * ⚠ Si `stateOrProvinceCode` NU se trimite: descrierea lor spune „required for
   * US, CA, PR and not required for other countries", iar FedEx n-are nomenclator
   * de judete romanesti. Un „B" inventat ar putea cadea la validare pe fiecare
   * comanda.
   */
  test("FEDEX primeste „Bucuresti”, iar sectorul pleaca pe adresa", () => {
    assert.equal(orasFedex(ADRESA.oras, ADRESA.judet), "Bucuresti");
    assert.equal(sectorPentruAdresa(ADRESA), "Sector 3");

    const p = parteFedex(ADRESA);
    assert.equal(p.address.city, "Bucuresti");
    assert.ok(p.address.streetLines.join(" ").includes("Sector 3"));
    assert.equal("stateOrProvinceCode" in p.address, false);
  });

  test("FEDEX nu inventeaza un sector in afara Bucurestiului", () => {
    assert.equal(sectorPentruAdresa({ oras: "Cluj-Napoca", judet: "Cluj" }), null);
    const p = parteFedex({ ...ADRESA, oras: "Cluj-Napoca", judet: "Cluj", codPostal: "400001" });
    assert.equal(p.address.city, "Cluj-Napoca");
    assert.equal(p.address.streetLines.join(" ").toLowerCase().includes("sector"), false);
  });

  /*
   * ⚠ UPS e tot in tabara CEA MARE, si tot fara camp de sector.
   *
   * Cautat `sector` in TOATE cele cincisprezece fisiere OpenAPI ale lor: ZERO
   * potriviri. La fel `bucharest` si `bucuresti`. UPS nu documenteaza nicio regula
   * de sector, deci nu se inventeaza una — orasul se pliaza in „Bucuresti", iar
   * sectorul pleaca pe adresa, unde chiar se tipareste: „All three Address Lines
   * will be printed on the label", pe cand din oras se tiparesc doar 15 caractere.
   *
   * ⚠ Si `StateProvinceCode` NU pleaca. Textul lor, repetat in unsprezece locuri, e
   * „Required for US, Canada, and Vietnam (VN)", iar singura tara europeana cu
   * regula proprie e Irlanda. In plus e o capcana de lungime: emiterea accepta 1-5
   * caractere, cotarea cere EXACT 2 — deci „Bucuresti" ar cadea la cotare, iar „B"
   * la amandoua.
   */
  test("UPS primeste „Bucuresti”, iar sectorul pleaca pe adresa", () => {
    assert.equal(orasUps(ADRESA.oras, ADRESA.judet), "Bucuresti");
    assert.equal(sectorUps(ADRESA), "Sector 3");

    const a = adresaUps({ ...ADRESA, tara: "RO" }, true);
    assert.equal(a.City, "Bucuresti");
    assert.ok(a.AddressLine.join(" ").includes("Sector 3"));
    assert.equal("StateProvinceCode" in a, false);
  });

  test("UPS nu inventeaza un sector in afara Bucurestiului, si nu trimite judetul", () => {
    assert.equal(sectorUps({ oras: "Cluj-Napoca", judet: "Cluj" }), null);
    assert.equal(judetUps("Cluj"), null);
    const a = adresaUps({ ...ADRESA, oras: "Cluj-Napoca", judet: "Cluj", codPostal: "400001", tara: "RO" }, true);
    assert.equal(a.City, "Cluj-Napoca");
    assert.equal(a.AddressLine.join(" ").toLowerCase().includes("sector"), false);
    assert.equal("StateProvinceCode" in a, false);
  });

  /*
   * ⚠ DHL e tot in tabara CEA MARE, si tot fara camp de sector — numai ca aici
   * dovada vine din propriul lor nomenclator, nu din tacerea documentatiei.
   *
   * Trei lucruri independente: `sector` are ZERO aparitii in specificatia lor de
   * 1,2 MB; tabelul lor de tari da pentru RO `divisionTypeCode = O`, adica
   * „Country-use when no divtype identif" — Romania n-are, la ei, nicio diviziune
   * administrativa declarata; iar propria lor adresa din ghid e „Calea Floreasca
   * 169A, Corp A, Etaj 8, Bucharest", fara sector.
   *
   * ⚠ FALSUL PRIETEN care ar strica exact proba asta: codul lor de eroare
   * `201200 Either pickup route or sector should be present`. Vorbeste despre
   * sectorul INTERN de rutare al curierului, nu despre sectoarele bucurestene.
   * Citit pe dos, duce „Sector 3" in `cityName` — adica muta DHL in tabara
   * Sameday si strica zonarea pe fiecare comanda bucuresteana.
   *
   * ⚠ Si `provinceCode` NU pleaca niciodata: schema il descrie „province or state
   * code", ghidul lor SOAP e transant („2 letter state code for the USA only"),
   * iar `minLength: 2` respinge din start un „B" inventat de noi.
   */
  test("DHL primeste „Bucuresti”, iar sectorul pleaca pe adresa", () => {
    assert.equal(orasDhl(ADRESA.oras, ADRESA.judet), "Bucuresti");
    assert.equal(sectorDhl(ADRESA), "Sector 3");
    assert.equal(judetDhl(ADRESA), "Sector 3");

    const a = adresaDhl({ ...ADRESA, tara: "RO" });
    assert.equal(a.cityName, "Bucuresti");
    assert.ok([a.addressLine1, a.addressLine2, a.addressLine3].join(" ").includes("Sector 3"));
    /* La DHL `countyName` e „suburb or county", deci un nivel SUB oras — acolo
       sectorul chiar e informatia potrivita, si pleaca si pe linii, si aici. */
    assert.equal(a.countyName, "Sector 3");
    assert.equal("provinceCode" in a, false);
  });

  test("DHL nu inventeaza un sector in afara Bucurestiului", () => {
    assert.equal(sectorDhl({ oras: "Cluj-Napoca", judet: "Cluj" }), null);
    assert.equal(judetDhl({ oras: "Cluj-Napoca", judet: "Cluj" }), null);

    const a = adresaDhl({
      ...ADRESA, oras: "Cluj-Napoca", judet: "Cluj", codPostal: "400001", tara: "RO",
    });
    assert.equal(a.cityName, "Cluj-Napoca");
    assert.equal(
      [a.addressLine1, a.addressLine2, a.addressLine3].join(" ").toLowerCase().includes("sector"),
      false,
    );
    assert.equal("provinceCode" in a, false);

    /* ⚠ Si judetul romanesc NU are voie sa apara ca `countyName`. Campul lor e
       „suburb or county" si sta SUB oras, deci „Cluj" pus acolo nu e o informatie
       in plus, e una gresita — iar motorul lor nu cade: aplica tacut regula de
       rezerva (`410502-410515 Pickup/Delivery PL fallback rule applied:
       PS->CP->P->C`) si intoarce 200 cu alta zona si alt pret. */
    assert.equal("countyName" in a, false);
  });

  /*
   * ⚠ SmartShip e in tabara CEA MARE, dar cu o rasucire proprie: orasul se
   * plieaza in „Bucuresti", iar sectorul pleaca in campul lui, `sector` (1-6).
   * Iar cand sectorul NU se poate afla, raspunsul e `null`, nu 0 — la ei 0
   * inseamna „nu e in Bucuresti", adica o afirmatie falsa despre adresa.
   */
  test("SMARTSHIP primeste „Bucuresti” plus sectorul intr-un camp separat", () => {
    assert.equal(localitateSmartship(ADRESA.oras, ADRESA.judet), "Bucuresti");
    assert.equal(sectorSmartship(ADRESA.oras, ADRESA.judet), 3);
    assert.equal(sectorSmartship("Cluj-Napoca", "Cluj"), 0);
    assert.equal(sectorSmartship("Bucuresti", "Municipiul Bucuresti"), null);
  });

  /*
   * Proba care conteaza cel mai mult: cele doua reguli trebuie sa ramana
   * DIFERITE. O egalitate aici ar insemna ca unul dintre cele doua feluri de
   * curieri a fost stricat — si ar fi stricat tacut, la livrare.
   */
  test("cele doua reguli NU au voie sa se intalneasca", () => {
    assert.notEqual(
      localitateSameday(ADRESA.oras, ADRESA.judet),
      normalizeLocalityName(ADRESA.oras, ADRESA.judet),
    );
    /* ⚠ Si fiecare curier care isi are propria functie de localitate trebuie sa
       ramana de partea LUI. DHL nu trece prin `normalizeLocalityName` direct (mai
       taie diacriticele si lungimea), deci o uniformizare l-ar putea muta singur. */
    assert.notEqual(
      localitateSameday(ADRESA.oras, ADRESA.judet),
      orasDhl(ADRESA.oras, ADRESA.judet),
    );
  });

  test("in afara Bucurestiului toti primesc acelasi lucru", () => {
    const cluj = { ...ADRESA, oras: "Cluj-Napoca", judet: "Cluj" };
    assert.equal(adresaGls(cluj).City, "Cluj-Napoca");
    assert.equal(adresaInnoship(cluj, "domiciliu").localityName, "Cluj-Napoca");
    assert.equal(localitateSameday(cluj.oras, cluj.judet), "Cluj-Napoca");
    assert.equal(localitatePosta(cluj.oras), "Cluj-Napoca");
    assert.equal(orasFedex(cluj.oras, cluj.judet), "Cluj-Napoca");
    assert.equal(orasDhl(cluj.oras, cluj.judet), "Cluj-Napoca");
  });

  test("diacriticele cad peste tot, nu doar pe unde ne-am amintit", () => {
    const iasi = { ...ADRESA, oras: "Iași", judet: "Iași" };
    assert.equal(adresaGls(iasi).City, "Iasi");
    assert.equal(adresaInnoship(iasi, "domiciliu").localityName, "Iasi");
    assert.equal(localitateSameday(iasi.oras, iasi.judet), "Iasi");
    assert.equal(orasFedex(iasi.oras, iasi.judet), "Iasi");
    assert.equal(orasDhl(iasi.oras, iasi.judet), "Iasi");
  });
});
