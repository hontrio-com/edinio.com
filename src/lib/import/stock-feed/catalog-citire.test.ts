import assert from "node:assert/strict";
import { test } from "node:test";
import { readVariants } from "./catalog";

/*
 * Citirea combinatiilor din `page_sections`.
 *
 * A doua trecere a aratat ca NIMIC din ce s-a adaugat aici nu era aparat: patru
 * mutatii din patru treceau nedetectate de toata suita. Fisierul asta le acopera.
 *
 * Ce se citeste de aici ajunge direct in indexul de potrivire si in decizia
 * „scrierea asta ajunge undeva sau nu", deci o citire gresita nu se vede ca
 * eroare — se vede ca stoc care nu se actualizeaza.
 */

const sectiuni = (combinatii: unknown[]) => ({
  variants: { enabled: true, combinations: combinatii },
});

test("gtin-ul combinatiei se citeste; gol sau lipsa inseamna null", () => {
  const v = readVariants(
    sectiuni([
      { id: "a", sku: "A", gtin: "5941234567890" },
      { id: "b", sku: "B", gtin: "   " },
      { id: "c", sku: "C" },
    ]),
  );
  assert.equal(v[0].gtin, "5941234567890");
  assert.equal(v[1].gtin, null, "un gtin din spatii nu e un gtin");
  assert.equal(v[2].gtin, null);
});

test("`enabled` lipsa inseamna STINSA, ca in declansatorul din Postgres", () => {
  /*
   * `sync_product_stock_from_variants` numara `(c->>'enabled')::boolean is true`,
   * deci lipsa NU inseamna aprinsa. Daca citirea de aici ar fi mai ingaduitoare
   * decat declansatorul, am promite scrieri pe care baza nu le confirma.
   *
   * In productie toate cele 47.314 de combinatii au cheia, deci regula nu
   * schimba nimic azi — dar prima combinatie scrisa fara ea ar fi facut-o.
   */
  const v = readVariants(
    sectiuni([{ id: "a", sku: "A", enabled: true }, { id: "b", sku: "B" }, { id: "c", sku: "C", enabled: false }]),
  );
  assert.equal(v[0].enabled, true);
  assert.equal(v[1].enabled, false, "lipsa = stinsa");
  assert.equal(v[2].enabled, false);
});

test("stocul numeric se recunoaste dupa aceeasi masura ca declansatorul", () => {
  /* Tiparul din Postgres e `^\s*\d+(\.\d+)?\s*$`: fara semn, fara virgula. */
  const v = readVariants(
    sectiuni([
      { id: "a", sku: "A", stock_quantity: 5 },
      { id: "b", sku: "B", stock_quantity: "7" },
      { id: "c", sku: "C", stock_quantity: " 12 " },
      { id: "d", sku: "D", stock_quantity: "3.0" },
      { id: "e", sku: "E", stock_quantity: "-2" },
      { id: "f", sku: "F", stock_quantity: "2,5" },
      { id: "g", sku: "G", stock_quantity: "" },
      { id: "h", sku: "H" },
    ]),
  );
  assert.deepEqual(
    v.map((x) => x.stockNumeric),
    [true, true, true, true, false, false, false, false],
  );
});

test("stocul scris ca SIR se citeste ca numar", () => {
  /* 696 din 14.326 de combinatii tin stocul ca sir. `Number.isFinite("5")` e
     fals, deci varianta scurta le-ar fi citit pe toate ca 0. */
  const v = readVariants(sectiuni([{ id: "a", sku: "A", stock_quantity: "5", price: "19.99" }]));
  assert.equal(v[0].stock_quantity, 5);
  assert.equal(v[0].price, 19.99);
});

test("combinatia fara pret propriu MOSTENESTE pretul produsului", () => {
  /*
   * Citit ca 0, previzualizarea arata o scadere inchipuita „de la 0" si feedul
   * scria un pret care era deja acolo.
   */
  const v = readVariants(sectiuni([{ id: "a", sku: "A" }, { id: "b", sku: "B", price: 0 }]), 149);
  assert.equal(v[0].price, 149, "lipsa inseamna „ca al produsului”");
  assert.equal(v[1].price, 0, "un zero SCRIS ramane zero");
});

test("combinatia fara id se sare: n-am avea unde sa scriem inapoi", () => {
  const v = readVariants(sectiuni([{ sku: "A" }, { id: "", sku: "B" }, { id: "c", sku: "C" }]));
  assert.equal(v.length, 1);
  assert.equal(v[0].id, "c");
});

test("fara bloc de variante nu iese nicio combinatie", () => {
  assert.deepEqual(readVariants(null), []);
  assert.deepEqual(readVariants({}), []);
  assert.deepEqual(readVariants({ variants: { enabled: true } }), []);
  assert.deepEqual(readVariants({ variants: { enabled: true, combinations: "nu e tablou" } }), []);
});
