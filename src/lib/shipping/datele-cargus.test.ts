import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dataEvenimentelorCargus, dataRambursurilorCargus, ziuaLorCargus } from "./datele-cargus";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * DOUA FORMATE DE DATA IN ACELASI API                          (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Documentatia lor V3 le scrie una sub alta, in doua capitole vecine:
 *
 *     AwbTrace/GetDeltaEvents:  FromDate - from date (format :mm-dd-yyyy)
 *     CashAccount/GetByDate:    FromDate - start date in yyyy-mm-dd format
 *
 * ⚠ CE COSTA DACA SE INCURCA: nimic nu da eroare. `03-11-2026` citit ca ISO e o data valida
 * (11 martie), iar `2026-03-11` citit american e tot una valida. Deci intervalul cerut e ALTUL
 * decat cel vrut, raspunsul vine gol sau strain, si cronul raporteaza linistit „zero de
 * verificat". Vezi `zero-randuri-nu-e-succes`.
 */

/* 11 martie 2026, o zi in care ziua si luna NU se pot confunda intre ele. */
const ZI = new Date(Date.UTC(2026, 2, 11, 13, 45, 0));

test("⚠ evenimentele cer data AMERICANA", () => {
  assert.equal(dataEvenimentelorCargus(ZI), "03-11-2026");
});

test("⚠ rambursurile cer data ISO", () => {
  assert.equal(dataRambursurilorCargus(ZI), "2026-03-11");
});

test("⚠⚠ cele doua formate chiar difera, altfel una din rute ar intreba alt interval", () => {
  /*
   * Afirmatia care apara reparatia de o simplificare: cineva ar putea „curata" cele doua
   * functii intr-una singura, si atunci una din rute ar cere tacut alte zile.
   */
  assert.notEqual(dataEvenimentelorCargus(ZI), dataRambursurilorCargus(ZI));
});

test("ziua si luna se completeaza cu zero, ca sa nu iasa `3-1-2026`", () => {
  const ianuarie = new Date(Date.UTC(2026, 0, 5, 0, 0, 0));
  assert.equal(dataEvenimentelorCargus(ianuarie), "01-05-2026");
  assert.equal(dataRambursurilorCargus(ianuarie), "2026-01-05");
});

test("⚠ datele se socotesc pe UTC, nu pe ceasul masinii", () => {
  /*
   * O rulare la 23:30 pe un server pe ora Romaniei ar fi cerut ziua urmatoare daca s-ar fi
   * folosit `getMonth`/`getDate`. Cronul merge pe Vercel, unde ceasul e UTC, dar afirmatia
   * tine regula pe loc daca vreodata nu mai e.
   */
  const noapte = new Date(Date.UTC(2026, 2, 11, 23, 59, 59));
  assert.equal(dataEvenimentelorCargus(noapte), "03-11-2026");
  assert.equal(dataRambursurilorCargus(noapte), "2026-03-11");
});

test("o data de-a lor se taie la ZI, si una neinteleasa nu se inventeaza", () => {
  assert.equal(ziuaLorCargus("2026-03-11T00:00:00"), "2026-03-11");
  assert.equal(ziuaLorCargus("2026-03-11"), "2026-03-11");
  assert.equal(ziuaLorCargus("  2026-03-11T06:38:06.267  "), "2026-03-11");
  assert.equal(ziuaLorCargus(null), null);
  assert.equal(ziuaLorCargus(""), null);
  assert.equal(ziuaLorCargus("11-03-2026"), null, "o data americana NU se ghiceste ca ISO");
  assert.equal(ziuaLorCargus(20260311), null);
  assert.equal(ziuaLorCargus({}), null);
});

/* ═══ MUTANTUL STA PE APELANT ═══ */
test("⚠ fiecare ruta cheama FORMATUL EI, si nu invers", () => {
  const client = readFileSync(new URL("../cargus.ts", import.meta.url), "utf8");

  const iEvenimente = client.indexOf("AwbTrace/GetDeltaEvents?FromDate=");
  const iRambursuri = client.indexOf("CashAccount/GetByDate?FromDate=");
  assert.notEqual(iEvenimente, -1, "ruta de evenimente nu se mai gaseste");
  assert.notEqual(iRambursuri, -1, "ruta de rambursuri nu se mai gaseste");

  const bucataEvenimente = client.slice(iEvenimente, iEvenimente + 200);
  const bucataRambursuri = client.slice(iRambursuri, iRambursuri + 200);

  assert.ok(
    bucataEvenimente.includes("dataEvenimentelorCargus(") && !bucataEvenimente.includes("dataRambursurilorCargus("),
    "evenimentele trebuie cerute cu data americana",
  );
  assert.ok(
    bucataRambursuri.includes("dataRambursurilorCargus(") && !bucataRambursuri.includes("dataEvenimentelorCargus("),
    "rambursurile trebuie cerute cu data ISO",
  );
});
