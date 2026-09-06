import test from "node:test";
import assert from "node:assert/strict";
import {
  cateFisiere, catePotOcupa, cheiaFisierului, extensiaPentru, fisiereleCerute,
  motivulRefuzului, nodurileDeFisiere, pixeliCeruti, tipurilePermise,
  MAX_FISIERE_PE_NOD, MAX_OCTETI,
} from "./fisiere";
import { normalizeazaValori } from "./valori";
import type { Definitie, Nod, NodFisiere } from "./definitie";

/**
 * Fisierele cumparatorului: ce se primeste, unde stau, si ce refuza serverul.
 *
 * ═══ ⚠ DE CE E ALTFEL DECAT ORICE INCARCARE DIN PLATFORMA ═══
 *
 * Cine urca aici n-are cont. Nu exista `user.id` de pus in cheie, nu exista cineva pe care sa dai
 * vina daca umple depozitul, si nu exista sesiune de care sa legi dreptul de a citi inapoi. Fiecare
 * proba de mai jos apara una dintre consecintele astea.
 */

const nod = (extra: Partial<NodFisiere> = {}): NodFisiere =>
  ({ fel: "fisiere", control: "imagine", id: "poza", eticheta: "Poza ta", ...extra } as NodFisiere);

const def = (noduri: Nod[]): Definitie =>
  ({ versiuneSchema: 1, mod: "auto", pasi: [{ id: "p1", eticheta: "Pas", grupuri: [{ id: "g1", noduri }] }] });

const jpeg = { mime: "image/jpeg", octeti: 1000, latime: 2000, inaltime: 1500 };

/* ══════════════════════════════════════════════════════════════════════════
   TIPURILE
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ SVG nu se primeste, oricat ar cere comerciantul", () => {
  /*
   * ⚠ Un SVG e un document XML care poate purta `<script>`. Servit de pe un domeniu al
   * platformei, el ruleaza pe originea aceea — adica XSS stocat, exact defectul care a fost deja
   * reparat o data la `uploadImage`, unde un fisier numit „poza.png" cu `type: "text/html"` ajungea
   * servit ca HTML.
   *
   * Lista comerciantului poate doar sa STRANGA lista platformei, niciodata s-o inlocuiasca.
   */
  const permise = tipurilePermise(nod({ tipuri: ["image/svg+xml", "text/html"] }));
  assert.ok(!permise.includes("image/svg+xml"), permise.join(", "));
  assert.ok(!permise.includes("text/html"), permise.join(", "));
});

test("lista comerciantului STRANGE lista platformei", () => {
  assert.deepEqual(tipurilePermise(nod({ tipuri: ["image/png"] })), ["image/png"]);
});

test("o lista care nu lasa nimic in picioare se ignora, nu inchide campul", () => {
  /*
   * ⚠ `tipuri: ["image/svg+xml"]` intersectat cu lista platformei da multimea goala. Luata ca
   * atare, campul ar fi refuzat ORICE fisier — pe pagina cumparatorului, fara ca el sa poata face
   * nimic si fara ca cineva sa afle de ce. Se cade inapoi pe lista platformei.
   */
  assert.deepEqual(tipurilePermise(nod({ tipuri: ["image/svg+xml"] })), ["image/jpeg", "image/png", "image/webp"]);
});

test("un camp de documente primeste PDF, nu imagini", () => {
  assert.deepEqual(tipurilePermise(nod({ control: "document" })), ["application/pdf"]);
});

test("tipul refuzat spune ce SE poate, nu doar ca nu se poate", () => {
  const m = motivulRefuzului(nod(), { ...jpeg, mime: "application/pdf" });
  assert.ok(m?.includes("JPG"), m ?? "");
  assert.ok(m?.includes("PNG"), m ?? "");
});

/* ══════════════════════════════════════════════════════════════════════════
   PLAFOANELE SUNT ALE NOASTRE
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ plafonul de marime e AL PLATFORMEI, nu al comerciantului", () => {
  /*
   * ⚠ `maxMb: 500` scris in panou ar fi deschis oricui o cale de a ne umple depozitul cu jumatate
   * de gigaoctet pe cerere — si cine incarca n-are cont, deci nu exista nici macar cineva caruia
   * sa i se inchida contul. Comerciantul poate doar sa stranga.
   */
  assert.equal(catePotOcupa(nod({ maxMb: 500 })), MAX_OCTETI);
  assert.equal(catePotOcupa(nod({ maxMb: 2 })), 2 * 1024 * 1024);
});

test("⚠ si plafonul de numar", () => {
  assert.equal(cateFisiere(nod({ maxFisiere: 900 })), MAX_FISIERE_PE_NOD);
  assert.equal(cateFisiere(nod({ maxFisiere: 3 })), 3);
});

test("valorile aiurea cad pe implicit, nu pe NaN", () => {
  for (const rau of [undefined, 0, -5, NaN, Infinity]) {
    assert.equal(cateFisiere(nod({ maxFisiere: rau as number })), 1, `maxFisiere=${rau}`);
    assert.ok(catePotOcupa(nod({ maxMb: rau as number })) > 0, `maxMb=${rau}`);
  }
});

test("un fisier gol se refuza", () => {
  assert.ok(motivulRefuzului(nod(), { ...jpeg, octeti: 0 }));
});

/* ══════════════════════════════════════════════════════════════════════════
   DIMENSIUNILE
   ══════════════════════════════════════════════════════════════════════════ */

test("imaginea prea mica se refuza, si i se spune CAT are si cat trebuie", () => {
  const m = motivulRefuzului(nod({ minLatimePx: 3000 }), jpeg);
  assert.ok(m?.includes("2000"), m ?? "");
  assert.ok(m?.includes("3000"), m ?? "");
});

test("⚠ dimensiunile se cer doar cand chiar s-au putut masura", () => {
  /*
   * ⚠ Un PDF n-are latime in pixeli. Un camp de documente cu `minLatimePx` scris din greseala
   * — sau ramas de la cand campul era de imagini — ar fi refuzat ORICE fisier, pe pagina
   * cumparatorului, fara ca el sa poata face nimic.
   */
  const pdf = { mime: "application/pdf", octeti: 5000, latime: null, inaltime: null };
  assert.equal(motivulRefuzului(nod({ control: "document", minLatimePx: 3000 }), pdf), null);
});

test("imaginea destul de mare trece", () => {
  assert.equal(motivulRefuzului(nod({ minLatimePx: 2000, minInaltimePx: 1500 }), jpeg), null);
});

/* ══════════════════════════════════════════════════════════════════════════
   CHEIA DIN R2
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ cheia nu se poate compune din id", () => {
  /*
   * ⚠ R2 se serveste public prin CDN cu `max-age` de un an. Daca cheia ar fi fost
   * `configurator/<business>/<id>.jpg`, oricine afla un id — si id-ul sta in cosul din
   * `localStorage`, deci si intr-o copie de ecran, si intr-un jurnal de browser — ar fi cerut
   * poza DIRECT de pe CDN, ocolind orice ruta si orice antet.
   */
  const cheie = cheiaFisierului("biz-1", "fis-1", "image/jpeg");
  assert.ok(cheie);
  assert.ok(!cheie!.endsWith("fis-1.jpg"), cheie!);
  assert.match(cheie!, /^configurator\/biz-1\/fis-1-[0-9a-f]{24}\.jpg$/);
});

test("acelasi fisier da mereu aceeasi cheie", () => {
  assert.equal(cheiaFisierului("b", "f", "image/png"), cheiaFisierului("b", "f", "image/png"));
});

test("⚠ doua magazine nu ajung la aceeasi cheie", () => {
  // Altfel stergerea unuia l-ar fi luat pe al celuilalt.
  assert.notEqual(cheiaFisierului("b1", "f", "image/png"), cheiaFisierului("b2", "f", "image/png"));
});

test("un tip necunoscut nu produce cheie", () => {
  assert.equal(cheiaFisierului("b", "f", "text/html"), null);
  assert.equal(extensiaPentru("image/svg+xml"), null);
});

/* ══════════════════════════════════════════════════════════════════════════
   CE CERE O CONFIGURATIE
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ fisierele ies CU CAMPUL de la care vin", () => {
  /*
   * ⚠ Verificarea de la plasarea comenzii compara fisierul cu limitele CAMPULUI lui. Fara sa se
   * stie de la care vine, un fisier de 8 MB urcat intr-un camp care primeste 10 ar fi trecut si
   * intr-unul care primeste 2 — adica limita s-ar fi aplicat la incarcare si nicaieri altundeva,
   * iar incarcarea o poate ocoli oricine cheama ruta de mana.
   */
  const d = def([nod({ id: "fata" }), nod({ id: "spate" })]);
  const cerute = fisiereleCerute(d, normalizeazaValori({
    fata: { f: "fisiere", v: [{ id: "a" }, { id: "b" }] },
    spate: { f: "fisiere", v: [{ id: "c" }] },
  }));
  assert.deepEqual(cerute, [
    { nodId: "fata", fisierId: "a" },
    { nodId: "fata", fisierId: "b" },
    { nodId: "spate", fisierId: "c" },
  ]);
});

test("o valoare pusa pe un camp care NU e de fisiere nu produce nimic", () => {
  /*
   * ⚠ Valorile vin de la client. Un `{ f: "fisiere" }` trimis pe id-ul unui camp de text ar fi
   * pus in comanda un fisier pe care nicio limita nu-l pazeste, fiindca nodul lui n-are limite.
   */
  const d = def([{ fel: "text", control: "scurt", id: "grav", eticheta: "Gravura" } as Nod]);
  assert.deepEqual(fisiereleCerute(d, normalizeazaValori({ grav: { f: "fisiere", v: [{ id: "a" }] } })), []);
});

test("nu arunca pe nimic din ce poate trimite clientul", () => {
  const d = def([nod()]);
  for (const rau of [undefined, null, {}, { poza: null }, { poza: { f: "fisiere" } }, { poza: { f: "fisiere", v: "x" } }]) {
    assert.doesNotThrow(() => fisiereleCerute(d, rau as never));
  }
  assert.deepEqual(fisiereleCerute(undefined, undefined), []);
});

test("nodurile de fisiere se gasesc dupa id", () => {
  const d = def([nod({ id: "poza" }), { fel: "text", control: "scurt", id: "t", eticheta: "T" } as Nod]);
  const h = nodurileDeFisiere(d);
  assert.equal(h.size, 1);
  assert.equal(h.get("poza")?.eticheta, "Poza ta");
});

/* ══════════════════════════════════════════════════════════════════════════
   CE VOIA SA SPUNA „300 DPI"
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ DPI-ul se traduce in pixeli, fiindca doar pixelii se pot masura", () => {
  /*
   * ⚠ „DPI"-ul unui fisier e un numar pe care fisierul il declara DESPRE SINE, si aproape toti
   * mint: o poza de 4000 px facuta cu telefonul se scrie 72 si e excelenta la tipar, iar o imagine
   * de 200x200 marita in Paint se poate scrie 300 si nu e buna de nimic. Refuzul pe numarul ala ar
   * fi respins tocmai fisierele bune.
   *
   * 20 cm la 300 DPI = 20/2,54 * 300 = 2362,2 -> 2363 px. Se rotunjeste IN SUS: la tipar,
   * „aproape destul" inseamna neclar.
   */
  assert.equal(pixeliCeruti(20, 300), 2363);
  assert.equal(pixeliCeruti(2.54, 300), 300);
});

test("numerele imposibile nu produc un NaN in camp", () => {
  for (const [cm, dpi] of [[0, 300], [20, 0], [-1, 300], [NaN, 300], [20, Infinity]]) {
    assert.equal(pixeliCeruti(cm, dpi), null, `${cm} cm la ${dpi} dpi`);
  }
});
