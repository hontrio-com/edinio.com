import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCsv, sheetToRecords, MAX_STOCK_ROWS } from "./csv";
import { parseTabular, recordsToCsv } from "./tabular";

/*
 * Fisierele reale de furnizor, cu tot ce au ele.
 *
 * Fiecare proba de aici a fost intai o cadere masurata pe codul vechi. Cazul de
 * la care a pornit tot: o ghilimea neinchisa taia 4000 de randuri la 2, iar
 * rularea se raporta REUSITA.
 */

test("ghilimea DESCHISA si neinchisa opreste citirea, nu taie fisierul in tacere", () => {
  /*
   * Cazul care face paguba: o ghilimea deschisa si niciodata inchisa inghite tot
   * restul fisierului intr-o singura celula. Masurat pe papaparse 5.5.3: 500 de
   * randuri devin 1, cu `code: "MissingQuotes"`.
   */
  const linii = ["Cod,Denumire,Stoc", 'A1,"Teava zincata,5'];
  for (let i = 2; i <= 500; i++) linii.push(`A${i},Produs ${i},${i}`);

  const p = parseCsv(linii.join("\n"), MAX_STOCK_ROWS);

  assert.equal(p.rows.length, 0, "un fisier care nu se poate citi nu are voie sa dea randuri");
  assert.ok(p.parseError, "trebuie sa spuna DE CE");
  assert.match(p.parseError, /ghilimea/);
  assert.match(p.parseError, /randului 2/, "trebuie sa spuna UNDE, ca omul sa poata cauta in fisier");
});

test("tolul dintr-un camp citat NU respinge fisierul: se citeste corect", () => {
  /*
   * `A1,"Teava 1" zincata",5` da `code: "InvalidQuotes"`, care e o PLANGERE, nu
   * o pierdere: papaparse intoarce toate randurile, cu valoarea intreaga. Prima
   * mea reparatie prindea tot ce era de tip „Quotes" si respingea integral
   * fisiere care se citeau pana la ultimul rand.
   */
  const linii = ["Cod,Denumire,Stoc", 'A1,"Teava 1" zincata",5'];
  for (let i = 2; i <= 50; i++) linii.push(`A${i},Produs ${i},${i}`);

  const p = parseCsv(linii.join("\n"), MAX_STOCK_ROWS);

  assert.equal(p.parseError, undefined, "fisierul se citeste, deci nu se respinge");
  assert.equal(p.rows.length, 50);
  assert.equal(p.rows[0].Denumire, 'Teava 1" zincata');
});

test("ghilimelele inchise corect NU deranjeaza pe nimeni", () => {
  /* Proba trebuie sa poata si sa treaca: un camp citat cu virgula si cu rand nou
     in el e felul obisnuit in care vine o descriere. */
  const p = parseCsv('Cod,Denumire,Stoc\nA1,"Teava, 1"" zincata",5\nA2,"Doua\nranduri",7\n');
  assert.equal(p.parseError, undefined);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].Denumire, 'Teava, 1" zincata');
  assert.equal(p.rows[1].Stoc, "7");
});

test("titlul de raport de deasupra unui tabel mai LAT se sare", () => {
  /* Regula sare un rand DOAR daca e mai ingust decat tabelul SI are o valoare in
     el. Un preambul lat cat tabelul nu se mai sare — vezi de ce, la
     `gasesteAntetul`: varianta lacoma promova randuri de DATE la antet. */
  const p = parseCsv(
    "Lista stocuri furnizor;01.08.2026\n\nCod;Denumire;Stoc;Pret\nA1;Tricou;5;9,99\nA2;Bluza;7;12,50\n",
  );
  assert.deepEqual(p.headers, ["Cod", "Denumire", "Stoc", "Pret"]);
  assert.equal(p.rows.length, 2);
  assert.equal(p.skippedBeforeHeader, 1);
});

test("un antet legitim cu o coloana numita ca o DATA nu se sare", () => {
  /*
   * Regresia prinsa la a doua trecere: varianta lacoma sarea peste acest antet
   * (fiindca „01.08.2026" arata a valoare), lua primul rand de DATE drept antet
   * si arunca tot ce era deasupra lui.
   */
  const p = parseCsv("Cod produs;Denumire;Disponibilitate;01.08.2026\nA1;Tricou;In stoc;DA\nA2;Bluza;Stoc epuizat;NU\n");
  assert.deepEqual(p.headers, ["Cod produs", "Denumire", "Disponibilitate", "01.08.2026"]);
  assert.equal(p.rows.length, 2, "niciun rand de date nu are voie sa se piarda");
  assert.equal(p.skippedBeforeHeader, undefined);
});

test("un rand de date fara valori numerice nu poate fi luat drept antet", () => {
  /* Cazul masurat care pierdea 57 de produse din 100: al 57-lea produs avea
     stocul si ultima coloana goale, deci nu mai avea nicio celula numerica, si
     regula lacoma il promova la antet — aruncand tot ce era inaintea lui. */
  const linii = ["Cod;Denumire;Stoc;01.08.2026"];
  for (let i = 1; i <= 20; i++) {
    linii.push(i === 7 ? "SKU-007;Produs fara stoc;;" : `SKU-${i};Produs ${i};${i};x`);
  }
  const p = parseCsv(linii.join("\n"));
  assert.deepEqual(p.headers, ["Cod", "Denumire", "Stoc", "01.08.2026"]);
  assert.equal(p.rows.length, 20, "toate randurile, inclusiv cele de dinaintea celui incomplet");
});

test("linia sep=; nu mai devine antet", () => {
  const p = parseCsv("sep=;\nCod;Stoc\nA1;5\n");
  assert.deepEqual(p.headers, ["Cod", "Stoc"]);
  assert.deepEqual(p.rows, [{ Cod: "A1", Stoc: "5" }]);
});

test("un antet cu o singura coloana ramane valid", () => {
  /* Regula de antet nu are voie sa ceara doua celule: o foaie cu o singura
     coloana e un caz real, si mergea. */
  const p = parseCsv("ean\n5941234567890\n");
  assert.deepEqual(p.headers, ["ean"]);
  assert.equal(p.rows.length, 1);
});

test("cand niciun rand nu arata a antet, se ia primul, ca inainte", () => {
  /* O regula mai stricta decat realitatea n-are voie sa refuze un fisier care
     mergea. Aici toate celulele primului rand sunt numere. */
  const p = parseCsv("1;2\n3;4\n");
  assert.deepEqual(p.headers, ["1", "2"]);
  assert.equal(p.rows.length, 1);
});

test("CSV si XLSX dau ACEEASI lista de coloane la antete repetate si goale", () => {
  /*
   * Inainte, acelasi tabel dadea liste diferite dupa formatul livrat: papaparse
   * redenumea a doua coloana `Stoc_1` si o pastra, iar coloanele goale de la
   * coada ieseau ca `_1`. Foaia de calcul le arunca pe amandoua.
   */
  const dublate = parseCsv("SKU,Stoc,Stoc\nA1,10,99\n");
  const dublateFoaie = sheetToRecords([
    ["SKU", "Stoc", "Stoc"],
    ["A1", 10, 99],
  ]);
  assert.deepEqual(dublate.headers, dublateFoaie.headers);
  assert.deepEqual(dublate.headers, ["SKU", "Stoc"]);
  assert.deepEqual(dublate.rows[0], dublateFoaie.rows[0]);

  const goale = parseCsv("SKU,Stoc,,\nA1,10,,\n");
  const goaleFoaie = sheetToRecords([
    ["SKU", "Stoc", "", ""],
    ["A1", 10, "", ""],
  ]);
  assert.deepEqual(goale.headers, goaleFoaie.headers);
  assert.deepEqual(goale.headers, ["SKU", "Stoc"]);
});

test("drumul dus-intors prin CSV pastreaza randurile", () => {
  /* `recordsToCsv` scrie fisierul pastrat in R2, iar `parseCsv` il reciteste la
     fiecare pas urmator. Daca regula de antet s-ar schimba, drumul s-ar rupe. */
  const original = sheetToRecords([
    ["Cod", "Stoc", "Pret"],
    ["A-1", 5, 9.99],
    ["B-2", 0, 12.5],
  ]);
  const dupaDrum = parseCsv(recordsToCsv(original));
  assert.deepEqual(dupaDrum.headers, original.headers);
  assert.deepEqual(dupaDrum.rows, original.rows);
});

const B = (s: string) => Buffer.from(s, "utf8");

test("continutul care nu e tabel e numit pe nume", async () => {
  const cazuri: [string, Buffer, RegExp][] = [
    ["HTML", B("<!DOCTYPE html>\n<html><body>Autentificare</body></html>"), /pagina web/],
    ["XML", B('<?xml version="1.0"?>\n<produse><p/></produse>'), /XML/],
    ["JSON", B('{"produse":[{"sku":"A"}]}'), /JSON/],
    ["PDF", B("%PDF-1.4\n%aaa\n1 0 obj\n"), /PDF/],
    ["gzip", Buffer.concat([Buffer.from([0x1f, 0x8b, 0x08, 0x00]), B("gunoi")]), /arhivat/],
  ];
  for (const [nume, buf, asteptat] of cazuri) {
    const r = await parseTabular(buf, "feed.csv", MAX_STOCK_ROWS);
    assert.ok("error" in r, `${nume} ar fi trebuit refuzat`);
    assert.match(r.error, asteptat, nume);
  }
});

test("un CSV adevarat trece prin aceleasi porti", async () => {
  const r = await parseTabular(B("Cod;Stoc;Pret\nA1;5;9,99\nA2;7;12,50\n"), "feed.csv", MAX_STOCK_ROWS);
  assert.ok(!("error" in r), "error" in r ? r.error : "");
  if ("error" in r) return;
  assert.deepEqual(r.parsed.headers, ["Cod", "Stoc", "Pret"]);
  assert.equal(r.parsed.rows.length, 2);
});

test("cp1250 nu mai iese mutilat, si coloana de pret nu se mai pierde", async () => {
  /*
   * Feedurile de furnizor din Romania vin des in cp1250. Masurat pe codul vechi:
   * `Pret` cu t-virgula ajungea `Pre<?>`, iar maparea automata PIERDEA coloana de
   * pret, fiindca `pre<?>` nu mai contine „pret". Fara nicio eroare nicaieri.
   */
  const cp1250 = Buffer.from([
    ...Buffer.from("Cod articol;Cantitate disponibil", "latin1"),
    0xe3, // a-breve
    ...Buffer.from(";Pre", "latin1"),
    0xfe, // t-sedila
    ...Buffer.from("\nA1;5;9,99\n", "latin1"),
  ]);

  const r = await parseTabular(cp1250, "feed.csv", MAX_STOCK_ROWS);
  assert.ok(!("error" in r), "error" in r ? r.error : "");
  if ("error" in r) return;
  assert.equal(r.parsed.headers[1], "Cantitate disponibilă");
  assert.match(r.parsed.headers[2], /^Pre/);
  /* Ce conteaza de fapt: numele sa fie citibil, nu sa contina semnul de inlocuire. */
  assert.ok(!r.parsed.headers.some((h) => h.includes("�")), "a ramas semnul de inlocuire");
});

test("UTF-16 cu BOM (Excel „Text Unicode”) se citeste", async () => {
  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from("SKU\tStoc\r\nA1\t5\r\n", "utf16le"),
  ]);
  const r = await parseTabular(utf16, "feed.csv", MAX_STOCK_ROWS);
  assert.ok(!("error" in r), "error" in r ? r.error : "");
  if ("error" in r) return;
  assert.deepEqual(r.parsed.headers, ["SKU", "Stoc"]);
  assert.deepEqual(r.parsed.rows, [{ SKU: "A1", Stoc: "5" }]);
});
