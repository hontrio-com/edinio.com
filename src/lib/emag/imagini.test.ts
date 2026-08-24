import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cheiaDerivatului, ePrimitaDeEmag } from "./imagini";
import { imaginiEmag, motivulImaginilor } from "./mapping";

/* ══════════════════════════════════════════════════════════════════════════
   WebP-UL IL FACE EDINIO. eMAG NU-L PRIMESTE. (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Conducta de incarcare a magazinului incearca `image/webp` prima, fiindca e mai mica
   si mai buna pentru vitrina. Schema eMAG, la `images[].url`, primeste numai „JPG, JPEG
   or PNG”.

   ⚠ Pana acum, urmarea era ca produsul se OPREA, cu mesajul „convertește imaginea” catre
   comerciant. Corect din punctul de vedere al datelor — nu pleaca o adresa pe care ei n-o
   pot citi — dar era o munca pe care i-o dam noi, pentru un fisier pe care tot noi l-am
   facut, si pe care el nici nu-l poate schimba din Edinio.

   ⚠ Masurat pe catalogul ANTAL INDUSTRY (24.08.2026): 1348 `.jpg`, un `.png`, patru
   `.webp`. Deci nu e o problema de masa — dar cele patru produse stateau blocate.
*/

test("filtrul lor ramane in picioare: `.webp` NU pleaca la eMAG", () => {
  /*
   * ⚠ Perechea reparatiei. Conversia se poate strica, iar daca atunci filtrul ar fi si el
   * slabit, un `.webp` ar pleca linistit — si eMAG NU se plange: produsul apare pur si
   * simplu fara poza, si nimeni nu afla.
   */
  assert.deepEqual(imaginiEmag(["https://edinio-cdn.com/a.webp"]), []);
  assert.equal(imaginiEmag(["https://edinio-cdn.com/a.jpg"]).length, 1);
  assert.equal(imaginiEmag(["https://edinio-cdn.com/a.png"]).length, 1);
});

test("ce e deja bun nu se atinge", () => {
  assert.equal(ePrimitaDeEmag("https://edinio-cdn.com/x/y.jpg"), true);
  assert.equal(ePrimitaDeEmag("https://edinio-cdn.com/x/y.jpeg"), true);
  assert.equal(ePrimitaDeEmag("https://edinio-cdn.com/x/y.PNG"), true);

  /* ⚠ Intrebarea se taie inainte de potrivire: fisierele noastre au uneori `?v=`, iar
     `.jpg?v=2` nu s-ar fi potrivit cu nimic si am fi convertit poze care erau bune. */
  assert.equal(ePrimitaDeEmag("https://edinio-cdn.com/x/y.jpg?v=2"), true);

  assert.equal(ePrimitaDeEmag("https://edinio-cdn.com/x/y.webp"), false);
  assert.equal(ePrimitaDeEmag("https://edinio-cdn.com/x/y.avif"), false);
  assert.equal(ePrimitaDeEmag("https://edinio-cdn.com/x/y.gif"), false);
});

test("cheia copiei se socoteste din adresa, deci a doua oara nu se mai converteste", () => {
  /*
   * ⚠ Asta e tot ce tine costul jos. Cu un nume intamplator, fiecare sincronizare a
   * fiecarui produs ar fi insemnat o descarcare, o conversie si o urcare — pentru un
   * fisier identic cu cel de ieri. Cronul trece din minut in minut.
   */
  const a = cheiaDerivatului("biz-1", "https://edinio-cdn.com/x/y.webp", "jpg");
  const b = cheiaDerivatului("biz-1", "https://edinio-cdn.com/x/y.webp", "jpg");
  assert.equal(a, b, "aceeasi imagine trebuie sa dea aceeasi cheie");

  const alta = cheiaDerivatului("biz-1", "https://edinio-cdn.com/x/z.webp", "jpg");
  assert.notEqual(a, alta, "doua imagini diferite nu au voie sa dea aceeasi cheie");
});

test("copiile a doua magazine nu se amesteca", () => {
  /*
   * ⚠ Aceeasi adresa nu poate aparea la doi comercianti — fisierele R2 au nume unice — dar
   * despartirea pe magazin ramane, fiindca de ea atarna curatenia si masurarea. Un dosar
   * comun ar fi facut imposibil raspunsul la „cat loc ocupa magazinul asta?”.
   */
  const unu = cheiaDerivatului("biz-1", "https://edinio-cdn.com/x/y.webp", "jpg");
  const doi = cheiaDerivatului("biz-2", "https://edinio-cdn.com/x/y.webp", "jpg");
  assert.notEqual(unu, doi);
  assert.match(unu, /^marketplaces\/emag\/biz-1\//);
});

test("extensia intra in cheie: transparenta merge pe PNG", () => {
  /*
   * ⚠ Un WebP cu fundal transparent turnat in JPEG iese cu fundal NEGRU. Pe o poza de
   * produs pe fundal alb, se vede din prima si arata ca o greseala a magazinului.
   */
  const jpg = cheiaDerivatului("biz-1", "https://edinio-cdn.com/x/y.webp", "jpg");
  const png = cheiaDerivatului("biz-1", "https://edinio-cdn.com/x/y.webp", "png");
  assert.notEqual(jpg, png);
  assert.match(png, /\.png$/);
});

test("conversia se cheama numai cand chiar e nevoie", () => {
  /*
   * ⚠ 1349 din 1353 de produse n-au nicio imagine de convertit. Chemata neconditionat,
   * functia ar fi facut cate un `HEAD` de fiecare imagine a fiecarui produs, la fiecare
   * trecere a cronului — adica mii de cereri pe minut pentru nimic.
   */
  const sursa = readFileSync("src/lib/emag/trimite.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  const i = sursa.indexOf("async function cuImaginiPrimiteDeEmag(");
  assert.ok(i > 0, "n-am gasit ajutorul");
  const corp = sursa.slice(i, sursa.indexOf(String.fromCharCode(10) + "}", i));

  assert.match(
    corp, /if \(toate\.every\(ePrimitaDeEmag\)\) return \{ produs, nereusite: \[\] \};/,
    "iesirea devreme trebuie sa vina INAINTE de orice cerere de retea",
  );
  assert.ok(
    corp.indexOf("toate.every(ePrimitaDeEmag)") < corp.indexOf("imaginiPentruEmag("),
    "si chiar inaintea conversiei, nu dupa",
  );
});

test("si pozele COMBINATIILOR se convertesc", () => {
  /*
   * ⚠ La un produs cu variante, poza combinatiei e cea PRINCIPALA a ofertei ei
   * (`display_type: 1`). Lasata `.webp`, marimea „Rosu” ar fi plecat fara poza, in timp ce
   * produsul intreg pleca cu ale lui — deci defectul s-ar fi vazut doar la o variantă din
   * cinci, si nimeni nu l-ar fi cautat acolo.
   */
  const sursa = readFileSync("src/lib/emag/trimite.ts", "utf8");
  const i = sursa.indexOf("async function cuImaginiPrimiteDeEmag(");
  const corp = sursa.slice(i, i + 3000);
  assert.match(corp, /combinatiiActiveUnice\(parseVariants\(/, "combinatiile trebuie citite");
  assert.match(corp, /psNou\.variants\?\.combinations/, "si poza lor trebuie inlocuita");
});

test("mesajul catre comerciant ramane adevarat cand conversia nu merge", () => {
  /*
   * ⚠ `motivulImaginilor` spunea odata „nu are nicio imagine https” pentru produse care
   * AVEAU exact o imagine, si aceea https — doar ca `.webp`. Comerciantul deschidea fisa,
   * vedea poza acolo, si cauta o zi o imagine lipsa care nu lipsea.
   *
   * Reparatia de azi face conversia, dar mesajul trebuie sa ramana corect pentru cazurile
   * in care conversia chiar nu poate: fisier stricat, R2 cazut, format necunoscut.
   */
  const m = motivulImaginilor(["https://edinio-cdn.com/x/y.webp"]);
  assert.match(m, /\.webp/i, "trebuie sa spuna CE format are, nu ca lipseste imaginea");
  assert.ok(!/nu are nicio imagine/.test(m), "si sa nu mai minta ca n-ar exista");
});
