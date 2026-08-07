import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cautaCategorii, potrivesteCategorie, potrivireSigura, traduCategorie,
} from "./ro-taxonomy";
import type { AboutYouCategory } from "./types";

/**
 * Un comerciant a conectat About You, a intrat la maparea categoriilor, a cautat
 * „genti” si n-a primit nimic. Taxonomia About You e in engleza — 851 de frunze,
 * cai de forma `Fashion|Women|Accessories|Bags & suitcases|Handbag` — iar
 * filtrarea de pe serverul lor compara sirul cautat cu numele caii. „rochii” da
 * zero rezultate, si nimeni nu are de unde sti ca trebuia scris „dress”.
 *
 * Categoriile de mai jos sunt copiate din raspunsul real al API-ului, inclusiv
 * ciudateniile lui: `Boot|Boot` si `Boots|Boots` exista amandoua, „Trainers” nu
 * e frunza (doar `Platform trainers`, `High-top trainers`), iar „Handbag” e un
 * singur cuvant — de aceea „bag” simplu nu-l gaseste niciodata.
 */
const cat = (id: number, path: string, parent_id: number | null = null): AboutYouCategory => ({
  id, path, parent_id, name: path.split("|").pop() as string,
});

const TAXONOMIE: AboutYouCategory[] = [
  cat(1452, "Fashion|Women|Accessories|Bags & suitcases|Handbag"),
  cat(1453, "Fashion|Women|Accessories|Bags & suitcases|Shopper"),
  cat(1469, "Fashion|Women|Accessories|Bags & suitcases|Beach bag"),
  cat(1463, "Fashion|Women|Accessories|Bags & suitcases|Travel bag"),
  cat(2437, "Fashion|Women|Accessories|Bags & suitcases|Belt bag|Belt bag"),
  cat(2440, "Fashion|Women|Accessories|Bags & suitcases|Toiletry bag|Laundry bag"),
  cat(1932, "Fashion|Women|Accessories|Bags & suitcases|Backpack|Backpack"),
  cat(1933, "Fashion|Women|Accessories|Bags & suitcases|Backpack|Sports backpack"),
  cat(1679, "Fashion|Men|Accessories|Bags & suitcases|Laptop bag"),
  cat(1945, "Fashion|Men|Accessories|Bags & suitcases|Backpack|Backpack"),
  cat(1490, "Fashion|Women|Overalls|Dress|Dress"),
  cat(1484, "Fashion|Women|Overalls|Dress|Evening dress"),
  cat(1483, "Fashion|Women|Overalls|Dress|Summer dress"),
  cat(1491, "Fashion|Women|Overalls|Dress|Sports dress"),
  cat(2352, "Fashion|Kids|Girls|Overalls|Dress|Dress"),
  cat(1552, "Fashion|Women|Bottoms|Jeans|Jeans"),
  cat(1626, "Fashion|Women|Shoes|Sandal|Sandal"),
  cat(2322, "Fashion|Women|Shoes|Outdoor shoe|Sandal"),
  cat(1806, "Fashion|Men|Shoes|Trainers|Platform trainers"),
  cat(1805, "Fashion|Men|Shoes|Trainers|High-top trainers"),
  cat(2192, "Fashion|Men|Shoes|Sports shoe|Sports shoe"),
  cat(1550, "Fashion|Men|Bottoms|Trousers|Trousers"),
  cat(2277, "Hardware|Men|Sport|Sports accessory|Sleeping bag"),
];

test("traducerea desface sinonimele si retine publicul tinta", () => {
  const q = traduCategorie("Genti de dama");
  assert.deepEqual(q.grupuri, [["bag", "handbag"]]);
  assert.equal(q.public, "women");
  assert.equal(q.sport, false);
});

test("„Genti” ajunge pe Handbag, nu pe Belt bag", () => {
  // Aici cadea totul: `Handbag` e un cuvant, deci tokenul „bag” nu-l atinge.
  // Singurele frunze cu „bag” ca token sunt exact cele gresite.
  const s = potrivesteCategorie("Genti", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(s[0].category_id, 1452);
  assert.ok(potrivireSigura(s), "potrivirea trebuie sa fie aplicabila fara confirmare");
});

test("cuvantul din urma ingusteaza: „Genti de voiaj” -> Travel bag", () => {
  const s = potrivesteCategorie("Genti de voiaj", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(s[0].category_id, 1463);
});

test("„Rochii de seară” bate „Rochii” pe frunza cu doua cuvinte", () => {
  const s = potrivesteCategorie("Rochii de seară", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(s[0].category_id, 1484);
  const simplu = potrivesteCategorie("Rochii", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(simplu[0].category_id, 1490);
});

test("publicul scris in numele categoriei bate setarea magazinului", () => {
  const s = potrivesteCategorie("Rucsacuri barbati", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(s[0].category_id, 1945);
});

test("varianta sportiva nu se alege cand nu a fost ceruta", () => {
  const s = potrivesteCategorie("Rucsacuri", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(s[0].category_id, 1932);
  const sport = potrivesteCategorie("Rucsacuri sport", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(sport[0].category_id, 1933);
});

test("calificativele din cale se evita: „Sandale” nu ajunge la Outdoor shoe", () => {
  const s = potrivesteCategorie("Sandale", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(s[0].category_id, 1626);
});

test("engleza merge fara dictionar, inclusiv la plural", () => {
  assert.equal(potrivesteCategorie("Handbags", TAXONOMIE, { publicImplicit: "women" })[0].category_id, 1452);
  assert.equal(potrivesteCategorie("Backpacks", TAXONOMIE, { publicImplicit: "men" })[0].category_id, 1945);
});

test("nu se aplica singura o potrivire care nu acopera exact frunza", () => {
  // About You n-are frunza „Trainers”: doar `Platform trainers` si `High-top
  // trainers`. A alege un stil in locul comerciantului ar fi o inventie.
  const s = potrivesteCategorie("Adidasi", TAXONOMIE, { publicImplicit: "men" });
  assert.ok(s.length > 0, "propunerile tot se arata");
  assert.equal(potrivireSigura(s), null);
});

test("nu se aplica singura o potrivire la egalitate intre doua sectiuni", () => {
  // „Rochii copii” cade intre Fete si Baieti; raspunsul corect e o intrebare.
  const s = potrivesteCategorie("Rochii copii", TAXONOMIE, { publicImplicit: null });
  const sigura = potrivireSigura(s);
  assert.equal(sigura?.category_id, 2352);   // aici Girls e singura ramura care exista
});

test("o categorie fara corespondent nu inventeaza nimic", () => {
  assert.deepEqual(potrivesteCategorie("Scule electrice", TAXONOMIE, {}), []);
});

test("cautarea libera gaseste si dupa termenul romanesc, si dupa fragment englez", () => {
  const ro = cautaCategorii("genti", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(ro[0].id, 1452);

  const fragment = cautaCategorii("hand", TAXONOMIE, { publicImplicit: "women" });
  assert.ok(fragment.some((c) => c.id === 1452));

  // Sub doua caractere nu are sens sa cautam: ar veni tot arborele.
  assert.deepEqual(cautaCategorii("g", TAXONOMIE), []);
});

test("diacriticele nu schimba rezultatul", () => {
  const cu = potrivesteCategorie("Poșete", TAXONOMIE, { publicImplicit: "women" });
  const fara = potrivesteCategorie("Posete", TAXONOMIE, { publicImplicit: "women" });
  assert.equal(cu[0].category_id, fara[0].category_id);
  assert.equal(cu[0].category_id, 1452);
});
