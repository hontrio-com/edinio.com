import { strict as assert } from "node:assert";
import { test } from "node:test";
import { adresaDeImagine } from "./imagini";

/*
  ⚠ MEDIUL SE PUNE ÎNAINTE DE ORICE PROBĂ, dar DUPĂ `import` — și e în regulă,
  fiindcă `gazdeleNoastre()` din `imagini.ts` citește mediul la fiecare folosire,
  nu o dată la încărcarea modulului. Dacă cineva o mută într-o constantă de
  modul, probele de aici cad, fiindcă `import` se ridică deasupra acestei linii.
*/
process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";
process.env.NEXT_PUBLIC_CDN_URL = "https://edinio-cdn.com";

const CAMP = "Adresa copertei";

test("gazda noastra de incarcare trece", () => {
  /*
    ⚠ EXACT FORMA PE CARE O PRODUCE `uploadToR2`: `${R2_PUBLIC_URL}/${key}`.
    Daca poarta asta ar fi mai stricta decat ce incarcam noi insine, fiecare
    coperta pusa din admin ar fi respinsa cu un mesaj care da vina pe om.
  */
  const r = adresaDeImagine("https://pub-alnostru.r2.dev/gallery/uid/blog/abc.webp", CAMP);
  assert.equal(r.ok, true, "adresa pe care o producem noi a fost respinsa");
});

test("domeniul CDN trece", () => {
  assert.equal(adresaDeImagine("https://edinio-cdn.com/gallery/x.webp", CAMP).ok, true);
});

test("o cale din public/ trece", () => {
  const r = adresaDeImagine("/imagini/coperta.png", CAMP);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.adresa, "/imagini/coperta.png");
});

test("gol e ingaduit: campul e optional", () => {
  for (const v of [null, undefined, "", "   "]) {
    const r = adresaDeImagine(v, CAMP);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.adresa, null);
  }
});

/*
  ⚠ ASTA E PROBA CARE INLOCUIESTE O USA DESCHISA.

  Pana pe 30.08.2026, `cover_url` si `og_image_url` erau verificate DOAR ca
  lungime (2048 de caractere). Actiunea de server e o adresa POST pe care oricine
  o poate chema direct, cu ce vrea in ea — deci se putea pune orice adresa
  straina, iar de acolo ies doua lucruri: un pixel care raporteaza altcuiva cine
  ne citeste, si o coperta care dispare in ziua in care gazda straina o sterge.
*/
test("o galeata R2 straina NU e a noastra, desi se termina in .r2.dev", () => {
  const r = adresaDeImagine("https://pub-alcuiva.r2.dev/pixel.gif", CAMP);
  assert.equal(r.ok, false, "a trecut o galeata R2 straina");
});

test("un domeniu strain nu trece", () => {
  assert.equal(adresaDeImagine("https://urmaritor.example/pixel.gif", CAMP).ok, false);
});

test("un domeniu care se termina in edinio.com nu e edinio.com", () => {
  assert.equal(adresaDeImagine("https://notedinio.com/x.png", CAMP).ok, false);
  assert.equal(adresaDeImagine("https://cdn.edinio.com/x.png", CAMP).ok, true);
});

test("adresa cu protocol mostenit nu trece, desi incepe cu /", () => {
  /* `//gazda/poza.png` arata a cale locala si e ceruta de la gazda straina, pe
     acelasi protocol ca pagina. Aceeasi capcana ca la curatatorul de HTML. */
  assert.equal(adresaDeImagine("//urmaritor.example/pixel.gif", CAMP).ok, false);
});

test("http simplu nu trece", () => {
  assert.equal(adresaDeImagine("http://pub-alnostru.r2.dev/x.webp", CAMP).ok, false);
});

test("schemele periculoase nu trec", () => {
  for (const v of ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "nu e adresa"]) {
    assert.equal(adresaDeImagine(v, CAMP).ok, false, `a trecut: ${v}`);
  }
});

test("motivul numeste campul, ca omul sa stie unde sa se uite", () => {
  const r = adresaDeImagine("https://strain.example/x.png", "Imaginea de partajare");
  assert.equal(r.ok, false);
  assert.ok(r.ok === false && r.motiv.includes("Imaginea de partajare"));
});
