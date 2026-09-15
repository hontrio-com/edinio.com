import test from "node:test";
import assert from "node:assert/strict";
import {
  STARI_COLETE, codulColete, eCodNecunoscutColete, eStareFinalaColete, eticheta,
  statusUrmatorColete, ultimulEvenimentColete,
} from "./statusuri-colete";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CODURILE SUNT ALE LOR, DAR TABELUL NU E PUBLICAT          (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Colete Online sta intre DPD, care isi publica tabelul intreg, si Woot sau Cargus, care nu
 * dau niciun cod: ei dau un `code` NUMERIC plus numele in romana pe fiecare eveniment, dar
 * enumerarea nu apare nicaieri. In toata specificatia lor OpenAPI exista UN SINGUR exemplu de
 * istoric, pe un drum fericit, cu zece coduri.
 *
 * ⚠ De aceea `STARI_COLETE` are exact acele zece, si nimic in plus. Ce nu s-a vazut nu misca
 * nimic.
 */

const ev = (code: number, unix: number, name = "", dateTime?: string) => ({
  code, unixDateTime: unix, dateTime, statusTextParts: { ro: { name, reason: "" } },
});

test("⚠ harta are EXACT codurile din exemplul lor, nu altele inventate", () => {
  /* Numerele astea nu sunt ghicite: sunt chiar cele din exemplul de istoric al specificatiei
     lor, cu numele lor cu tot. */
  assert.deepEqual(Object.keys(STARI_COLETE).sort(), [
    "10000", "11000", "20050", "20100", "20200", "20210", "20400", "20500", "20800", "9000",
  ].sort());
  assert.equal(STARI_COLETE["20800"].nume, "Colet livrat");
  assert.equal(STARI_COLETE["20050"].nume, "Ridicat de la expeditor");
});

test("⚠⚠ ce e INAINTE de ridicare nu misca comanda", () => {
  /*
   * „Document de transport emis" nu inseamna ca a plecat ceva: coletul e inca la comerciant.
   * Mutata pe „Expediata" atunci, comanda ar minti, iar emailul de expediere (cand va exista)
   * ar pleca prea devreme.
   */
  for (const cod of ["9000", "10000", "11000"]) {
    assert.equal(STARI_COLETE[cod].treapta, undefined, cod);
    assert.equal(statusUrmatorColete("confirmed", cod), null, cod);
  }
});

test("ridicarea si drumul prin retea duc comanda pe „expediat”", () => {
  for (const cod of ["20050", "20100", "20200", "20210", "20400", "20500"]) {
    assert.equal(statusUrmatorColete("confirmed", cod), "shipped", cod);
  }
});

test("⚠ „Colet livrat” duce comanda pe livrat, si incheie drumul", () => {
  assert.equal(statusUrmatorColete("shipped", "20800"), "delivered");
  assert.equal(eStareFinalaColete("20800"), true);
  assert.equal(eStareFinalaColete("20500"), false);
});

test("⚠⚠ NU SE COBOARA NICIODATA, si anulatele nu se misca de la curier", () => {
  assert.equal(statusUrmatorColete("delivered", "20500"), null, "livrat nu se intoarce la expediat");
  assert.equal(statusUrmatorColete("shipped", "20050"), null, "expediat nu se re-expediaza");
  for (const s of ["cancelled", "refunded"]) {
    assert.equal(statusUrmatorColete(s, "20800"), null, s);
  }
});

test("⚠⚠ un cod NEVAZUT nu misca nimic, si se strange pe nume", () => {
  /*
   * Codurile de refuz, retur sau livrare esuata nu apar in exemplul lor. Ghicite dupa banda
   * („20xxx inseamna in retea, deci 20900 inseamna livrat"), un retur ar fi trecut drept
   * livrare, iar factura ar fi plecat. Se strang si harta creste din trafic ADEVARAT.
   */
  for (const cod of ["20900", "30000", "21000", "1"]) {
    assert.equal(statusUrmatorColete("shipped", cod), null, cod);
    assert.equal(eStareFinalaColete(cod), false, cod);
    assert.equal(eCodNecunoscutColete(cod), true, cod);
  }
  assert.equal(eCodNecunoscutColete("20800"), false);
  assert.equal(eCodNecunoscutColete(null), false, "lipsa codului nu e „cod necunoscut”");
});

test("codul se citeste si ca numar, si ca sir de cifre, dar nu din orice", () => {
  assert.equal(codulColete(ev(20800, 1)), "20800");
  assert.equal(codulColete({ code: "20800" }), "20800");
  assert.equal(codulColete({ code: " 20800 " }), "20800");
  assert.equal(codulColete({ code: "livrat" }), null);
  assert.equal(codulColete({ code: null }), null);
  assert.equal(codulColete({}), null);
  assert.equal(codulColete(null), null);
  assert.equal(codulColete({ code: Number.NaN }), null);
});

test("⚠⚠ ultimul eveniment se ia dupa TIMP, nu dupa locul din lista", () => {
  /*
   * Ordinea in care ni le dau ei nu e promisa nicaieri in specificatie. Luat ultimul din
   * lista, un eveniment vechi venit la coada ar fi coborat starea coletului.
   */
  const istoric = [ev(20800, 300, "Colet livrat"), ev(20050, 100), ev(20500, 200)];
  assert.equal(codulColete(ultimulEvenimentColete(istoric)), "20800");

  /* Si pe dos: cel mai nou pus primul. */
  const peDos = [ev(20500, 200), ev(20800, 300, "Colet livrat"), ev(20050, 100)];
  assert.equal(codulColete(ultimulEvenimentColete(peDos)), "20800");
});

test("⚠ la timpi EGALI castiga cel de mai tarziu din lista", () => {
  /* Doua evenimente cu aceeasi secunda chiar apar in exemplul lor (20210 de doua ori). */
  const istoric = [ev(20200, 500, "In depozit"), ev(20400, 500, "In depozit central")];
  assert.equal(codulColete(ultimulEvenimentColete(istoric)), "20400");
});

test("cand lipseste `unixDateTime`, se cade pe `dateTime`", () => {
  const istoric = [
    { code: 20050, dateTime: "2020-07-30T13:58:50.000Z", statusTextParts: { ro: { name: "a" } } },
    { code: 20800, dateTime: "2020-07-31T08:24:58.000Z", statusTextParts: { ro: { name: "b" } } },
  ];
  assert.equal(codulColete(ultimulEvenimentColete(istoric)), "20800");
});

test("un istoric gol sau stricat nu arunca", () => {
  assert.equal(ultimulEvenimentColete([]), null);
  assert.equal(ultimulEvenimentColete(null), null);
  assert.equal(ultimulEvenimentColete(undefined), null);
  assert.equal(ultimulEvenimentColete([{ code: 1 }]), null, "fara timp, evenimentul nu se poate ordona");
});

test("eticheta imbina numele si motivul, cum le scriu ei", () => {
  assert.equal(eticheta(ev(20800, 1, "Colet livrat")), "Colet livrat");
  assert.equal(
    eticheta({ code: 20210, statusTextParts: { ro: { name: "In depozit", reason: "Sortare pe banda" } } }),
    "In depozit: Sortare pe banda",
  );
  assert.equal(eticheta({ statusTextParts: { ro: { reason: "doar motiv" } } }), "doar motiv");
  assert.equal(eticheta(null), "");
  assert.equal(eticheta({}), "");
});
