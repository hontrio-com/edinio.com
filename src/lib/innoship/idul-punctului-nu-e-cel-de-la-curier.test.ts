import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";

import { normalizeazaPuncte, puncteDoarCuIdDeCurier, randLaPunct } from "./puncte";
import { adresaInnoship } from "./expediere";

/*
 * ⚠⚠ ID-UL DE LA CURIER NU E ID DE INNOSHIP, SI SPECIFICATIA LOR O DOVEDESTE.
 *
 * Raspunsul lui `GET /api/Location/FixedLocations` e singurul contract nedocumentat
 * din tot API-ul lor (reverificat 16.09.2026: `responses: {200: {description:
 * "OK"}}`, fara schema). De aceea randul se citeste TOLERANT, cu o lista de nume
 * cu putinta, iar butonul Diagnostic arata cheile reale.
 *
 * Lista aceea avea la coada `courierFixedLocationId`. Si tocmai argumentul care il
 * pune pe `fixedLocationId` primul il exclude pe celalalt:
 *
 *   `OrderRequest.addressTo` are AMANDOUA campurile, separat, cu nume diferite:
 *   `fixedLocationId` SI `courierFixedLocationId`.
 *
 * Deci nu sunt doua nume pentru acelasi lucru: sunt doua lucruri. Folosit ca
 * rezerva, id-ul de la CURIER ajungea in campul lui Innoship, iar ce urmeaza e ori
 * un refuz (vizibil, si atunci e bine), ori o expediere catre alt punct decat cel
 * ales de cumparator, cu HTTP 200 si cu omul trimis sa ridice de unde nu e nimic.
 *
 * Aceeasi clasa cu „acelasi camp, doua feluri de id" de la Shipo si SmartShip,
 * doar ca acolo capcana e scrisa in documentatia lor, iar aici se vede numai
 * punand alaturi doua parti ale specificatiei.
 *
 * ═══ CE APARA PROBELE ═══
 *
 *   1. un rand cu id de Innoship e citit ca pana acum;
 *   2. ⚠ un rand cu DOAR id de curier NU mai produce punct: lipsa lui din lista se
 *      vede, un punct gresit nu se vede deloc;
 *   3. ⚠ si nu se pierde tacut: se numara, si numarul ajunge in Diagnostic;
 *   4. iar la emitere, `fixedLocationId` chiar pleaca in campul lui.
 */

describe("Innoship: id-ul punctului vine doar din campurile LUI", () => {
  test("randul cu `fixedLocationId` se citeste ca pana acum", () => {
    const p = randLaPunct({ fixedLocationId: "RO-123", name: "Easybox Unirii", localityName: "Bucuresti" });
    assert.equal(p?.id, "RO-123");
    assert.equal(p?.name, "Easybox Unirii");
  });

  test("celelalte nume de rezerva raman valabile", () => {
    for (const cheie of ["id", "locationId", "externalLocationId"]) {
      const p = randLaPunct({ [cheie]: "X1", name: "Punct" });
      assert.equal(p?.id, "X1", `${cheie} nu mai e citit`);
    }
  });

  /* ⚠ Chiar defectul, scris ca proba. */
  test("randul cu DOAR id de curier nu mai produce punct", () => {
    const p = randLaPunct({ courierFixedLocationId: "FAN-999", name: "Punct FAN", localityName: "Cluj-Napoca" });
    assert.equal(p, null, "id-ul de la curier a ajuns iar sa treaca drept id de Innoship");
  });

  test("cand randul are amandoua, castiga cel al lui Innoship", () => {
    const p = randLaPunct({ fixedLocationId: "RO-7", courierFixedLocationId: "FAN-999", name: "Punct" });
    assert.equal(p?.id, "RO-7");
  });

  test("lista intreaga: randurile nefolosibile se lasa afara", () => {
    const puncte = normalizeazaPuncte([
      { fixedLocationId: "RO-1", name: "Unu" },
      { courierFixedLocationId: "FAN-2", name: "Doi" },
      { id: "RO-3", name: "Trei" },
    ]);
    assert.deepEqual(puncte.map((p) => p.id), ["RO-1", "RO-3"]);
  });
});

/*
 * ⚠ SI NU SE PIERD TACUT.
 *
 * Zero inseamna ca excluderea nu costa nimic. Un numar mare inseamna ca
 * nomenclatorul lor arata altfel decat presupunem, si atunci raspunsul nu e sa
 * punem la loc campul gresit, ci sa intrebam ce inseamna.
 */
describe("Innoship: randurile lasate afara se numara", () => {
  test("numara exact randurile care au doar id de curier", () => {
    assert.equal(puncteDoarCuIdDeCurier([
      { fixedLocationId: "RO-1" },
      { courierFixedLocationId: "FAN-2" },
      { courierFixedLocationId: "FAN-3", fixedLocationId: "RO-4" },
      { name: "fara niciun id" },
      { courierFixedLocationId: "FAN-5" },
    ]), 2);
  });

  test("zero cand nomenclatorul e intreg", () => {
    assert.equal(puncteDoarCuIdDeCurier([{ fixedLocationId: "RO-1" }, { id: "RO-2" }]), 0);
    assert.equal(puncteDoarCuIdDeCurier([]), 0);
  });

  /*
   * ⚠ Masura trebuie sa AJUNGA la om. O numaratoare care nu se vede nicaieri e o
   * masuratoare pentru cine citeste codul, nu pentru cine tine magazinul.
   */
  test("numarul ajunge in Diagnostic, si panoul il arata", () => {
    const actiune = readFileSync("src/lib/actions/innoship.actions.ts", "utf8");
    assert.match(actiune, /puncteDoarCurier:\s*puncteDoarCuIdDeCurier\(puncte\)/);

    const panou = readFileSync("src/components/dashboard/InnoshipConfigClient.tsx", "utf8");
    assert.match(panou, /diagnostic\.puncteDoarCurier > 0/);
  });
});

/*
 * ⚠ MUTANTUL PE APELANT: id-ul ales pleaca in campul LUI.
 *
 * Toata grija de mai sus n-ar valora nimic daca la emitere id-ul ar ajunge in alt
 * camp, sau deloc.
 */
describe("Innoship: la emitere, punctul pleaca in `fixedLocationId`", () => {
  const ADRESA = {
    nume: "Ion Popescu",
    strada: "Calea Victoriei 12",
    oras: "Bucuresti",
    judet: "Bucuresti",
    telefon: "0721000000",
    email: "ion@exemplu.ro",
  };

  test("la locker se trimite punctul, in campul lui Innoship", () => {
    const a = adresaInnoship(ADRESA, "locker", "RO-123") as Record<string, unknown>;
    assert.equal(a.fixedLocationId, "RO-123");
    assert.equal(a.courierFixedLocationId, undefined);
  });

  test("la domiciliu nu pleaca niciun punct", () => {
    const a = adresaInnoship(ADRESA, "domiciliu") as Record<string, unknown>;
    assert.equal(a.fixedLocationId, undefined);
  });
});
