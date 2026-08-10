import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  codNumeric,
  eStareFinala,
  esteRetur,
  statusComandaDinCod,
  statusFinalDinStari,
  statusUrmator,
  trebuieSemnalat,
  ultimaStare,
  type StareCitita,
} from "./statusuri";

/*
 * Codurile vin din Appendix G al documentatiei MyGLS (ver. 25.12.11) — nu
 * ghicite. Un status tradus gresit nu crapa nimic: comanda pur si simplu ajunge
 * in starea nepotrivita, tacut. Iar la ramburs asta inseamna bani marcati
 * incasati care nu s-au incasat.
 */

test("codul vine ca sir, dar se citeste ca numar", () => {
  assert.equal(codNumeric("5"), 5);
  assert.equal(codNumeric(" 55 "), 55);
  assert.equal(codNumeric(null), null);
  assert.equal(codNumeric(undefined), null);
  assert.equal(codNumeric(""), null);
  assert.equal(codNumeric("livrat"), null);
  /* Zecimalele nu sunt coduri: „5.5" nu e nici 5, nici 55. */
  assert.equal(codNumeric("5.5"), null);
});

test("⚠ 55 (livrat la ParcelShop) NU inchide comanda", () => {
  /*
   * Cea mai scumpa confuzie din tot fisierul. 5 = livrat clientului;
   * 55 = ajuns la PUNCT, omul inca nu l-a ridicat, iar la ramburs GLS ia banii
   * abia la ridicare.
   */
  assert.equal(statusComandaDinCod("5"), "delivered");
  assert.equal(statusComandaDinCod("55"), "shipped");
  assert.notEqual(statusComandaDinCod("55"), "delivered");
  /* Si celelalte doua stari de ParcelShop. */
  assert.equal(statusComandaDinCod("56"), "shipped", "stocat in ParcelShop");
  assert.equal(statusComandaDinCod("59"), "shipped", "ridicare din ParcelShop");
  assert.equal(statusComandaDinCod("57"), "shipped", "timp de stocare depasit");
});

test("54 si 58 sunt livrari adevarate", () => {
  /* Parcel box si vecin cu semnatura: coletul a iesit din mana GLS. */
  assert.equal(statusComandaDinCod("54"), "delivered");
  assert.equal(statusComandaDinCod("58"), "delivered");
});

test("⚠ 51 inseamna ca datele au intrat, dar coletul e INCA la comerciant", () => {
  /*
   * „the parcel was not yet handed over to GLS". Marcat „expediat", clientul ar
   * primi email de expediere pentru un colet care n-a plecat.
   */
  assert.equal(statusComandaDinCod("51"), "processing");
  assert.notEqual(statusComandaDinCod("51"), "shipped");
  assert.equal(statusComandaDinCod("52"), "processing", "datele de ramburs introduse");
});

test("1 (predat catre GLS) inseamna expediat", () => {
  assert.equal(statusComandaDinCod("1"), "shipped");
});

test("⚠ 23 si 40 (retur la expeditor) nu inchid si nu anuleaza comanda", () => {
  /*
   * Marfa se intoarce, dar anularea atrage dupa ea eliberare de stoc si uneori
   * rambursare — decizii ale comerciantului, nu ale curierului. Se semnaleaza.
   */
  for (const cod of ["23", "40"]) {
    assert.equal(statusComandaDinCod(cod), null, `cod ${cod}`);
    assert.equal(statusUrmator("shipped", cod), null, `cod ${cod}`);
    assert.ok(esteRetur(cod), `cod ${cod} e retur`);
    assert.ok(trebuieSemnalat(cod), `cod ${cod} se semnaleaza`);
  }
  assert.equal(esteRetur("5"), false);
});

test("coletele distruse sau pierdute nu se inchid singure", () => {
  for (const cod of ["28", "31", "42", "43"]) {
    assert.notEqual(statusComandaDinCod(cod), "delivered", `cod ${cod}`);
    assert.ok(trebuieSemnalat(cod), `cod ${cod} se semnaleaza`);
  }
});

test("incercarile esuate de livrare raman „expediat”", () => {
  /* Nu sunt anulari: se mai incearca. */
  for (const cod of ["11", "12", "14", "16", "17", "18", "20", "36"]) {
    assert.equal(statusComandaDinCod(cod), "shipped", `cod ${cod}`);
    assert.ok(trebuieSemnalat(cod), `cod ${cod} cere atentia comerciantului`);
  }
});

test("blocajele de vama tin coletul in retea, deci ramane expediat", () => {
  for (const cod of ["60", "61", "64", "70", "71"]) {
    assert.equal(statusComandaDinCod(cod), "shipped", `cod ${cod}`);
  }
});

test("un cod necunoscut nu misca nimic", () => {
  /* GLS poate adauga coduri oricand. */
  assert.equal(statusComandaDinCod("999"), null);
  assert.equal(statusUrmator("processing", "999"), null);
  assert.equal(trebuieSemnalat("999"), false);
});

test("statusul nu coboara niciodata", () => {
  assert.equal(statusUrmator("delivered", "1"), null);
  assert.equal(statusUrmator("delivered", "55"), null);
  assert.equal(statusUrmator("shipped", "51"), null);
});

test("urca normal pe scara", () => {
  assert.equal(statusUrmator("pending", "51"), "processing");
  assert.equal(statusUrmator("processing", "1"), "shipped");
  assert.equal(statusUrmator("shipped", "5"), "delivered");
});

test("acelasi status de doua ori nu produce a doua scriere", () => {
  assert.equal(statusUrmator("shipped", "2"), null);
  assert.equal(statusUrmator("delivered", "5"), null);
  assert.equal(statusUrmator("processing", "51"), null);
});

test("⚠ o comanda anulata sau rambursata nu se misca de la un curier", () => {
  for (const cod of ["1", "5", "55", "23", "51"]) {
    assert.equal(statusUrmator("cancelled", cod), null, `cancelled + ${cod}`);
    assert.equal(statusUrmator("refunded", cod), null, `refunded + ${cod}`);
  }
});

test("niciun cod nu e in acelasi timp livrare si semnal de problema", () => {
  /* Un cod care ar inchide comanda SI ar cere atentie ar fi o contradictie:
     ori a ajuns la client, ori e ceva de rezolvat. */
  for (let cod = 1; cod <= 72; cod++) {
    const s = String(cod);
    if (statusComandaDinCod(s) === "delivered") {
      assert.equal(trebuieSemnalat(s), false, `codul ${cod} e si livrare, si problema`);
    }
  }
});

// ─── Teancul de stari, asa cum vine de la GetParcelStatuses ──────────────────

const s = (cod: string, data: string | null = null): StareCitita => ({ cod, data });

test("⚠ statusul iese din TOATE starile, nu din ultima primita", () => {
  /*
   * Cazul concret: un colet livrat luni are marti o linie de vama (cod 60), care
   * se traduce „expediat". Luata ca ultima stare, comanda ar cobori de la livrata
   * la expediata — si clientul ar vedea in cont ca pachetul e din nou pe drum.
   */
  const stari = [s("51"), s("3"), s("5"), s("60")];
  assert.equal(statusFinalDinStari("confirmed", stari), "delivered");
});

test("⚠ ordinea starilor nu schimba rezultatul", () => {
  /*
   * MyGLS nu promite nicaieri ca lista vine cronologic, iar `client.ts` o intoarce
   * exact cum a primit-o. Rezultatul trebuie sa fie treapta cea mai INALTA
   * atinsa, oricum ar fi asezate.
   */
  const stari = [s("51"), s("3"), s("5")];
  const invers = [...stari].reverse();
  const amestecat = [stari[1], stari[2], stari[0]];
  assert.equal(statusFinalDinStari("pending", stari), "delivered");
  assert.equal(statusFinalDinStari("pending", invers), "delivered");
  assert.equal(statusFinalDinStari("pending", amestecat), "delivered");
});

test("⚠ 51 singur inseamna „inca la comerciant”, nu expediat", () => {
  /* Altfel pleaca email de expediere pentru un colet care n-a plecat. */
  assert.equal(statusFinalDinStari("confirmed", [s("51")]), "processing");
  assert.equal(statusFinalDinStari("processing", [s("51")]), null);
});

test("⚠ 55 (livrat la ParcelShop) NU inchide comanda", () => {
  /* Omul n-a ridicat coletul, iar la ramburs GLS ia banii abia la ridicare. */
  assert.equal(statusFinalDinStari("shipped", [s("55")]), null);
  assert.equal(statusFinalDinStari("confirmed", [s("55")]), "shipped");
});

test("un teanc gol sau numai cu coduri necunoscute nu misca nimic", () => {
  assert.equal(statusFinalDinStari("shipped", []), null);
  assert.equal(statusFinalDinStari("shipped", [s("9999"), s(""), s("abc")]), null);
});

test("⚠ o comanda anulata nu se misca, oricat de multe stari ar veni", () => {
  assert.equal(statusFinalDinStari("cancelled", [s("5"), s("3")]), null);
  assert.equal(statusFinalDinStari("refunded", [s("5")]), null);
});

test("⚠ cea mai recenta stare se alege dupa DATA, nu dupa pozitie", () => {
  /*
   * Codul retinut pe comanda hotaraste ce se semnaleaza si ce nu. Luat din
   * pozitia din tablou, o lista sosita in alta ordine ar face cronul sa
   * resemnaleze un eveniment vechi la fiecare rulare.
   */
  const stari = [
    s("3", "2026-08-01T10:00:00.000Z"),
    s("23", "2026-08-03T10:00:00.000Z"),
    s("5", "2026-08-02T10:00:00.000Z"),
  ];
  assert.equal(ultimaStare(stari)?.cod, "23");
});

test("fara nicio data citibila se cade pe ultimul element, nu pe niciunul", () => {
  const stari = [s("3"), s("5")];
  assert.equal(ultimaStare(stari)?.cod, "5");
  assert.equal(ultimaStare([]), null);
  /* Una singura cu data bate oricate fara. */
  assert.equal(ultimaStare([s("3"), s("40", "2026-08-01T00:00:00.000Z")])?.cod, "40");
});

test("⚠ starile incheiate scot coletul din raza cronului", () => {
  /*
   * Returul (23/40) NU misca statusul comenzii — decizia e a comerciantului —
   * deci fara steagul asta coletul ar fi reinterogat la fiecare rulare timp de
   * trei saptamani, degeaba.
   */
  assert.equal(eStareFinala("23"), true);
  assert.equal(eStareFinala("40"), true);
  assert.equal(eStareFinala("5"), true);
  assert.equal(eStareFinala("55"), false, "la ParcelShop, inca se poate ridica");
  assert.equal(eStareFinala("3"), false);
  assert.equal(eStareFinala(null), false, "necunoscut nu inseamna incheiat");
  assert.equal(eStareFinala(""), false);
});

test("⚠ ce e final si nu misca statusul trebuie sa fie si de semnalat", () => {
  /*
   * Altfel ar exista un colet care iese din raza cronului fara ca nimeni sa afle
   * vreodata ce a patit — dispare in tacere.
   */
  for (const cod of ["23", "40", "28", "31", "42"]) {
    assert.equal(eStareFinala(cod), true, `${cod} ar trebui sa incheie urmarirea`);
    assert.equal(statusComandaDinCod(cod), null, `${cod} nu are voie sa mute comanda`);
    assert.equal(trebuieSemnalat(cod), true, `${cod} ar trebui semnalat`);
  }
});

test("returul e un caz aparte al semnalarii", () => {
  assert.equal(esteRetur("23"), true);
  assert.equal(esteRetur("40"), true);
  assert.equal(esteRetur("28"), false);
});
