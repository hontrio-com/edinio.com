import assert from "node:assert/strict";
import { test } from "node:test";
import { hrefCatalog, hrefCategorie, radacinaMagazin, radacinaMagazinCuFiltre, slugCategorie } from "./category-href";

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

/**
 * Paginile de categorie: aceeasi functie, alta forma de adresa.
 *
 * Regula pe care o apara testele de mai jos e ca forma cu interogare NU dispare
 * — magazinele fara pagina de catalog o folosesc mai departe, iar un nume care
 * nu produce niciun segment cade inapoi pe ea in loc sa dea un link rupt.
 */

test("cu pagini de categorie, adresa devine o cale", () => {
  assert.equal(hrefCategorie("/pravalie/magazin", "Imbracaminte de lucru", true), "/pravalie/magazin/imbracaminte-de-lucru");
});

test("fara pagini de categorie ramane exact forma de dinainte", () => {
  assert.equal(hrefCategorie("/pravalie", "Imbracaminte de lucru"), "/pravalie?cat=Imbracaminte%20de%20lucru");
});

test("diacriticele si semnele dispar din cale, nu si din nume", () => {
  assert.equal(slugCategorie("Imbracaminte & incaltaminte"), "imbracaminte-incaltaminte");
  assert.equal(slugCategorie("Manusi de protectie"), "manusi-de-protectie");
});

test("un nume care nu da niciun segment cade pe forma cu interogare", () => {
  assert.equal(slugCategorie("!!!"), "");
  assert.equal(hrefCategorie("/magazin", "!!!", true), "/magazin?cat=!!!");
});

test("pe domeniu propriu calea porneste de la radacina, fara slash dublu", () => {
  assert.equal(hrefCategorie("/magazin", "Hartie", true), "/magazin/hartie");
});

/*
 * ═══ FILTRELE SUPRAVIETUIESC REDIRECTARII ═══
 *
 * Defectul, asa cum l-a gasit SANTINELA pe 09.08.2026 — nu un audit, nu un test:
 *
 *   proba „paginarea da ALTE produse", magazinul nordic-outlet-bucovina
 *   -> „pagina 2 arata aceleasi produse ca pagina 1"
 *
 * Paginarea era intreaga. `/{slug}/magazin` face redirect catre radacina pentru
 * magazinele care au produsele pe pagina principala, iar redirectarea folosea
 * `radacinaMagazin`, care nu vede filtrele — deci `?page=2` disparea pe drum si
 * amandoua cererile ajungeau pe pagina 1.
 *
 * Verificat pe purtarea VECHE, ca sa se stie ca testele de mai jos chiar prind:
 *   radacinaMagazin("/nordic-outlet-bucovina") -> "/nordic-outlet-bucovina"
 * adica acelasi rezultat, indiferent de filtre.
 */

test("filtrele supravietuiesc redirectarii — chiar defectul gasit de santinela", () => {
  assert.equal(
    radacinaMagazinCuFiltre("/nordic-outlet-bucovina", { page: "2" }),
    "/nordic-outlet-bucovina?page=2",
  );
  assert.equal(radacinaMagazinCuFiltre("/x", { q: "geaca", page: "3" }), "/x?q=geaca&page=3");
});

test("fara filtre, adresa ramane exact cea de dinainte", () => {
  // Drumul obisnuit nu are voie sa se schimbe: fara sir de interogare,
  // rezultatul trebuie sa fie identic cu `radacinaMagazin`.
  for (const basePath of ["/x", ""]) {
    assert.equal(radacinaMagazinCuFiltre(basePath, {}), radacinaMagazin(basePath));
  }
});

test("pe domeniu propriu radacina ramane `/`, cu filtre cu tot", () => {
  // `basePath` e gol acolo; fara normalizare ar iesi `?page=2`, adica o adresa
  // relativa lipita de calea curenta.
  assert.equal(radacinaMagazinCuFiltre("", { page: "2" }), "/?page=2");
});

test("un parametru repetat isi pastreaza TOATE valorile", () => {
  // `?cat=a&cat=b` ajunge ca tablou. Pastrat doar primul, filtrarea pe mai multe
  // valori s-ar fi pierdut tacut — acelasi fel de pierdere ca defectul de sus.
  assert.equal(radacinaMagazinCuFiltre("/x", { cat: ["a", "b"] }), "/x?cat=a&cat=b");
});

test("valorile lipsa sau goale nu lasa parametri sterpi", () => {
  // `?q=` gol ar arata ca o cautare dupa nimic si ar putea goli catalogul.
  assert.equal(radacinaMagazinCuFiltre("/x", { q: undefined, page: "" }), "/x");
});

test("caracterele speciale se codeaza, nu rup adresa", () => {
  const v = radacinaMagazinCuFiltre("/x", { q: "geacă & pantaloni" });
  assert.ok(!v.includes(" "), v);
  assert.equal(new URL(v, "https://e.com").searchParams.get("q"), "geacă & pantaloni");
});

test("previzualizarea proprietarului nu se pierde la redirect", () => {
  // Fara ea, proprietarul care isi vede magazinul nepublicat era scos din
  // previzualizare de fiecare redirectare.
  assert.equal(radacinaMagazinCuFiltre("/x", { preview: "1" }), "/x?preview=1");
});
