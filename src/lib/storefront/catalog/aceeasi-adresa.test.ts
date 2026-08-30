import { strict as assert } from "node:assert";
import { test } from "node:test";
import { aceeasiAdresa } from "./aceeasi-adresa";

/*
 * ⚠ Functia asta inlocuieste un `ref` care s-a desincronizat de DOUA ori, in doua
 * feluri opuse:
 *
 *   11.08  paginarea OSCILA intre doua pagini (starea ramanea in urma)
 *   14.08  de pe pagina 2 nu se mai putea ajunge NICIODATA pe pagina 1 — nici din
 *          `Inapoi`, nici apasand pe numarul 1 — si nu pleca nicio cerere de retea
 *
 * A doua oara masurat direct in productie, pe bricosmart. De aceea comparatia nu
 * mai sta intr-un `ref` ascuns intr-un efect, ci intr-o functie pura care se poate
 * proba.
 */

const ACUM = "https://bricosmart.ro/magazin?page=2";

test("⚠⚠ pagina 1 e ALTA adresa decat pagina 2 — cazul care nu mai naviga", () => {
  /*
   * Adresa paginii 1 n-are deloc parametrul `page` (`pagina > 1` in `adresaPentru`).
   * Exact aici se intepenea: tinta „/magazin" era gasita egala cu ce credea
   * `ref`-ul ca s-a cerut, deci navigarea se anula in liniste.
   */
  assert.equal(aceeasiAdresa("/magazin", ACUM), false);
  assert.equal(aceeasiAdresa("/magazin?page=3", ACUM), false);
  /* Si invers: de pe pagina 1, pagina 1 chiar e aceeasi. */
  assert.equal(aceeasiAdresa("/magazin", "https://bricosmart.ro/magazin"), true);
});

test("aceeasi pagina nu produce o navigare degeaba", () => {
  assert.equal(aceeasiAdresa("/magazin?page=2", ACUM), true);
});

test("⚠ ordinea parametrilor nu e o schimbare", () => {
  /*
   * Grija pentru care exista `ref`-ul la inceput: catalogul compune parametrii
   * intr-o ordine fixa, dar bara de adrese poate sa-i aiba in alta (link trimis,
   * adresa scrisa de mana, revenire din istoric). Pastrata, fara `ref`.
   */
  const acum = "https://x.ro/magazin?cat=Manusi&page=2&sort=pret";
  assert.equal(aceeasiAdresa("/magazin?page=2&sort=pret&cat=Manusi", acum), true);
  assert.equal(aceeasiAdresa("/magazin?page=3&sort=pret&cat=Manusi", acum), false);
});

test("⚠ un filtru in plus sau in minus ESTE o schimbare", () => {
  const acum = "https://x.ro/magazin?cat=Manusi";
  assert.equal(aceeasiAdresa("/magazin", acum), false, "s-a scos categoria");
  assert.equal(aceeasiAdresa("/magazin?cat=Manusi&sale=1", acum), false, "s-a adaugat reducerea");
});

test("slashul de la sfarsit nu schimba pagina", () => {
  /* `/magazin/` lua un 308 la fiecare apasare; nu are voie sa para alta adresa. */
  assert.equal(aceeasiAdresa("/magazin/", "https://x.ro/magazin"), true);
  assert.equal(aceeasiAdresa("/magazin", "https://x.ro/magazin/"), true);
});

test("alta cale inseamna alta pagina, oricat de asemenea ar fi parametrii", () => {
  assert.equal(aceeasiAdresa("/magazin/manusi?page=2", ACUM), false);
});

test("o adresa necitibila NU intepeneste navigarea", () => {
  /*
   * Implicitul e „nu e aceeasi", deci se navigheaza. Cel mai rau caz e o navigare
   * in plus; celalalt implicit ar fi fost chiar defectul reparat: blocaj tacut.
   */
  assert.equal(aceeasiAdresa("/magazin", "nu e o adresa"), false);
});

test("⚠ valorile cu diacritice si spatii se compara dupa decodare, nu dupa scriere", () => {
  /* Aceeasi categorie, scrisa o data codificat si o data nu: nu e o schimbare. */
  const acum = "https://x.ro/magazin?cat=" + encodeURIComponent("Mănuși de lucru");
  assert.equal(aceeasiAdresa("/magazin?cat=M%C4%83nu%C8%99i%20de%20lucru", acum), true);
});
