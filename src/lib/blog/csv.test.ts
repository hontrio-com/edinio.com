import { strict as assert } from "node:assert";
import { test } from "node:test";
import { campCsv, randCsv } from "./csv";

/*
  ⚠ CE APARA PROBELE ASTEA nu e formatul CSV — acela era deja bun — ci ce se
  intampla DUPA ce fisierul e deschis intr-o foaie de calcul.

  Excel si LibreOffice citesc o celula care incepe cu `=`, `+`, `-` sau `@` drept
  FORMULA, oricate ghilimele ar avea in jur. Iar verificarea adresei de email din
  `blog-abonati.actions.ts` e deliberat simpla („are un @, are punct in domeniu,
  n-are spatii"), tocmai fiindca una completa dupa RFC respinge adrese valide.

  Drumul intreg: cineva se inscrie cu o astfel de adresa, confirma singur prin
  dubla confirmare — are cutia lui, deci poate — asteapta ca un admin sa exporte
  lista, iar formula se executa pe calculatorul adminului la deschidere.
*/

test("o adresa care incepe cu = nu mai pleaca drept formula", () => {
  const c = campCsv("=1+1@example.com");
  assert.ok(c.startsWith(`"'=`), `celula e ${c}`);
});

test("si celelalte trei semne care pornesc o formula", () => {
  for (const semn of ["+", "-", "@"]) {
    const c = campCsv(`${semn}ceva@example.com`);
    assert.ok(c.startsWith(`"'${semn}`), `${semn} a trecut nescapat: ${c}`);
  }
});

test("tabul si returul de car, care sparg randurile", () => {
  /* Scrise cu \u...: ca atare sunt invizibile in fisier, iar primul copy-paste
     le pierde — aceeasi capcana ca la diacriticele combinate. */
  for (const semn of ["\u0009", "\u000d"]) {
    assert.ok(campCsv(semn + "x").startsWith(`"'`), "un caracter de control a trecut");
  }
});

test("o adresa obisnuita ramane neatinsa", () => {
  assert.equal(campCsv("ion@example.com"), '"ion@example.com"');
});

test("ghilimelele se dubleaza, ca fisierul sa nu se rupa", () => {
  assert.equal(campCsv('a"b'), '"a""b"');
});

test("virgula nu rupe randul", () => {
  const r = randCsv(["a,b", "c"]);
  assert.equal(r, '"a,b","c"');
  /* Trei ghilimele de deschidere = doua campuri, nu trei. */
  assert.equal(r.split('","').length, 2);
});

test("gol si lipsa dau o celula goala, nu „null”", () => {
  assert.equal(campCsv(null), '""');
  assert.equal(campCsv(undefined), '""');
  assert.equal(campCsv(""), '""');
});

test("un rand intreg de abonat", () => {
  const r = randCsv(["ion@example.com", "blog", "2026-08-30T10:00:00Z", "2026-08-29T09:00:00Z"]);
  assert.equal(r, '"ion@example.com","blog","2026-08-30T10:00:00Z","2026-08-29T09:00:00Z"');
});

/*
  ⚠ SI CA APOSTROFUL NU STRICA ADRESA pentru cine citeste CSV-ul ca DATE.

  El e o conventie a foilor de calcul: „ce urmeaza e text". O unealta care
  citeste fisierul programatic vede un apostrof in plus — deci cine importa
  adrese trebuie sa-l stie. Nota asta exista ca sa nu fie o surpriza.
*/
test("apostroful se pune DOAR unde e nevoie", () => {
  assert.ok(!campCsv("ion@example.com").includes("'"));
  assert.ok(campCsv("=ion@example.com").includes("'"));
});
