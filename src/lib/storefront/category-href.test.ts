import assert from "node:assert/strict";
import { test } from "node:test";
import { hrefCategorie, radacinaMagazin } from "./category-href";

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
