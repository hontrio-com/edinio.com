import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { adresaGls } from "@/lib/gls/expediere";
import { adresaInnoship } from "@/lib/innoship/expediere";
import { localitatePosta, sectorDinOras } from "@/lib/posta/expediere";
import { localitateSameday, normalizeLocalityName } from "@/lib/utils/ro-address";

/**
 * ═══ O COMANDA DIN BUCURESTI, UNSPREZECE CURIERI, DOUA ADEVARURI ═══
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

  test("CARGUS, DPD si FAN pliaza prin acelasi ajutor", () => {
    assert.equal(normalizeLocalityName(ADRESA.oras, ADRESA.judet), "Bucuresti");
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
  });

  test("in afara Bucurestiului toti primesc acelasi lucru", () => {
    const cluj = { ...ADRESA, oras: "Cluj-Napoca", judet: "Cluj" };
    assert.equal(adresaGls(cluj).City, "Cluj-Napoca");
    assert.equal(adresaInnoship(cluj, "domiciliu").localityName, "Cluj-Napoca");
    assert.equal(localitateSameday(cluj.oras, cluj.judet), "Cluj-Napoca");
    assert.equal(localitatePosta(cluj.oras), "Cluj-Napoca");
  });

  test("diacriticele cad peste tot, nu doar pe unde ne-am amintit", () => {
    const iasi = { ...ADRESA, oras: "Iași", judet: "Iași" };
    assert.equal(adresaGls(iasi).City, "Iasi");
    assert.equal(adresaInnoship(iasi, "domiciliu").localityName, "Iasi");
    assert.equal(localitateSameday(iasi.oras, iasi.judet), "Iasi");
  });
});
