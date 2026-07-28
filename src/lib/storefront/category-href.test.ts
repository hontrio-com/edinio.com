import assert from "node:assert/strict";
import { test } from "node:test";
import { hrefCatalog, hrefCategorie, radacinaMagazin } from "./category-href";

/**
 * Un slash in plus nu se vede nicaieri: pagina se incarca la fel, doar ca prin
 * doua cereri in loc de una, iar Search Console numara fiecare categorie ca
 * „pagina cu redirectionare". De aceea are teste.
 */

test("radacina e / pe domeniu propriu, unde basePath e gol", () => {
  assert.equal(radacinaMagazin(""), "/");
});

test("radacina nu capata slash pe adresa cu slug", () => {
  assert.equal(radacinaMagazin("/magazin"), "/magazin");
});

test("categoria pune interogarea direct pe slug, fara slash intermediar", () => {
  assert.equal(hrefCategorie("/magazin", "Hartie"), "/magazin?cat=Hartie");
});

test("categoria pastreaza radacina pe domeniu propriu", () => {
  assert.equal(hrefCategorie("", "Hartie"), "/?cat=Hartie");
});

test("numele de categorie e codificat", () => {
  assert.equal(hrefCategorie("/magazin", "Articole casa"), "/magazin?cat=Articole%20casa");
  assert.equal(hrefCategorie("/magazin", "Baie & bucatarie"), "/magazin?cat=Baie%20%26%20bucatarie");
});

/**
 * Radacina catalogului nu e neaparat radacina magazinului: cand catalogul are
 * pagina lui, argumentul e o cale mai adanca. Trebuie sa treaca neatinsa, si pe
 * adresa cu slug, si pe domeniu propriu.
 */
test("radacina catalogului poate fi o subpagina, pe ambele feluri de adresa", () => {
  assert.equal(hrefCategorie("/pravalie/magazin", "Hartie"), "/pravalie/magazin?cat=Hartie");
  assert.equal(hrefCategorie("/magazin", "Hartie"), "/magazin?cat=Hartie");
});

/**
 * Idempotenta e plasa de siguranta a mutarii: un apel ramas cu `basePath` in loc
 * de radacina catalogului trebuie sa dea exact ce dadea inainte, nu un link
 * relativ lipit de pagina curenta.
 */
test("un basePath gol ramas dintr-un apel vechi da tot radacina, nu link relativ", () => {
  assert.equal(hrefCategorie("", "Hartie"), "/?cat=Hartie");
  assert.equal(hrefCategorie(radacinaMagazin(""), "Hartie"), hrefCategorie("", "Hartie"));
});

/**
 * Cautarea din header ducea la `${basePath}/?q=...`. Slash-ul acela costa un 308
 * la fiecare cautare, deci si un drum dus-intors, si o „pagina cu
 * redirectionare" in Search Console.
 */
test("adresa catalogului nu are slash inaintea interogarii", () => {
  assert.equal(hrefCatalog("/pravalie", "q=creion"), "/pravalie?q=creion");
  assert.equal(hrefCatalog("/pravalie/magazin", "q=creion"), "/pravalie/magazin?q=creion");
});

test("adresa catalogului fara interogare e chiar radacina lui", () => {
  assert.equal(hrefCatalog("/pravalie"), "/pravalie");
  assert.equal(hrefCatalog("", ""), "/");
  assert.equal(hrefCatalog(""), "/");
});
