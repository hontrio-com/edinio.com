import { strict as assert } from "node:assert";
import { test } from "node:test";

import { catreCsv, celula, csvStatistici, numeFisierCsv } from "./statistici-csv";
import { DETALIU_GOL, type DetaliuVanzari } from "./statistici";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Un CSV stricat nu da nicio eroare: se deschide, arata a tabel si minte. Toate
  felurile in care poate minti sunt aici.
*/

test("zecimala e virgula, ca sa poata Excel romanesc aduna coloana", () => {
  /*
    ⚠ Scris „1234.56", Excel pe setari romanesti il ia drept TEXT. Coloana s-ar
    fi adunat la zero, fara sa se planga nimeni.
  */
  assert.equal(celula(1234.56), "1234,56");
  assert.equal(celula(0), "0");
  assert.equal(celula(-12.5), "-12,5");
});

test("numerele care nu sunt numere ies celule goale, nu „NaN”", () => {
  assert.equal(celula(NaN), "");
  assert.equal(celula(Infinity), "");
  assert.equal(celula(null), "");
  assert.equal(celula(undefined), "");
});

test("un text cu punct si virgula in el nu rupe randul", () => {
  /*
    ⚠ Separatorul e `;`. Un produs numit „Set 3 becuri; E27" ar fi impins
    coloanele cu una, si toate cifrele randului ar fi aparut sub alt cap de
    tabel - o citire gresita care arata perfect normala.
  */
  assert.equal(celula("Set 3 becuri; E27"), '"Set 3 becuri; E27"');
});

test("ghilimelele se dubleaza, randurile noi se inchid", () => {
  assert.equal(celula('Tablou „Apus" mare'), '"Tablou „Apus"" mare"');
  assert.equal(celula("doua\nranduri"), '"doua\nranduri"');
});

test("un text linistit nu se imbraca degeaba in ghilimele", () => {
  assert.equal(celula("Pled din lana"), "Pled din lana");
});

test("randurile se despart cu CRLF si celulele cu punct si virgula", () => {
  assert.equal(catreCsv([["a", 1], ["b", 2.5]]), "a;1\r\nb;2,5");
});

test("numele fisierului spune ce e inauntru si din ce perioada", () => {
  assert.equal(
    numeFisierCsv("statistici", "2026-08-22", "2026-09-20"),
    "edinio-statistici-2026-08-22_2026-09-20.csv",
  );
});

/* ── Fisierul intreg ──────────────────────────────────────────────────────── */

function detaliu(x: Partial<DetaliuVanzari> = {}): DetaliuVanzari {
  return { ...DETALIU_GOL, ...x, sumar: { ...DETALIU_GOL.sumar, ...x.sumar } };
}

test("blocurile goale nu ajung in fisier ca titluri fara nimic sub ele", () => {
  const csv = csvStatistici({
    vanzari: null, trafic: null, detaliu: detaliu(), judete: [],
    perioadaScrisa: "22 aug. - 20 sept. 2026", canal: "",
  });
  assert.ok(!csv.includes("Produse"), "n-ar trebui sa existe un bloc de produse gol");
  assert.ok(!csv.includes("Judete"));
  assert.ok(csv.includes("Sumar"), "sumarul exista mereu, chiar si cu zerouri");
});

test("fisierul spune perioada, canalul si ce inseamna o vanzare", () => {
  /*
    ⚠ Fara randurile astea, fisierul ajunge intr-un raport unde nimeni nu mai
    stie daca anularile sunt inauntru sau afara, si cifra pleaca mai departe.
  */
  const csv = csvStatistici({
    vanzari: null, trafic: null, detaliu: detaliu(), judete: [],
    perioadaScrisa: "1 ian. - 20 sept. 2026", canal: "emag",
  });
  assert.ok(csv.includes("Perioada;1 ian. - 20 sept. 2026"));
  assert.ok(csv.includes("Canal;eMAG"), "canalul se scrie cum il stie comerciantul");
  assert.ok(csv.includes("Orice comanda care nu e anulata sau rambursata."));
});

test("produsele isi pastreaza numele intreg, cu tot ce au in el", () => {
  const csv = csvStatistici({
    vanzari: null, trafic: null, judete: [], perioadaScrisa: "azi", canal: "",
    detaliu: detaliu({
      produse: [{ product_id: "p1", nume: "Bec; 4 W", bucati: 32, vanzari: 1221, comenzi: 8 }],
    }),
  });
  assert.ok(csv.includes('"Bec; 4 W";32;8;1221'));
});
