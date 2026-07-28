import test from "node:test";
import assert from "node:assert/strict";
import {
  construiesteFatete,
  indiciSelectati,
  numaraSelectia,
  trecefiltrele,
  type RandPentruFatete,
} from "./facets";

/**
 * Fatetele se construiesc din liste libere, scrise de comercianti si de importul
 * CSV, deci testele lucreaza pe tipare REALE din productie, nu pe date inventate:
 * identificatorii care trebuie sa dispara si atributele care trebuie sa ramana
 * sunt exact cei din cele doua magazine mari.
 */

function produs(id: string, over: Partial<RandPentruFatete> = {}): RandPentruFatete {
  return { id, ...over };
}

const spec = (perechi: [string, string][]) => ({ specifications: perechi.map(([label, value]) => ({ label, value })) });
const varianta = (nume: string, valori: string[]) => ({
  variants: { enabled: true, options: [{ id: nume.toLowerCase(), name: nume, values: valori }] },
});

test("un cod unic per produs nu devine filtru", () => {
  // „Cod de bare": 981 de valori distincte pe 981 de produse. Fiecare valoare ar
  // fi intors exact un produs, adica un filtru care nu filtreaza.
  const randuri = Array.from({ length: 20 }, (_, i) =>
    produs(`p${i}`, { page_sections: spec([["Cod de bare", `59012345678${i}`]]) }),
  );
  const { fatete } = construiesteFatete(randuri);
  assert.deepEqual(fatete, []);
});

test("un atribut adevarat trece, cu numaratori corecte", () => {
  // „Certificari": 7 valori pe 405 de produse.
  const randuri = [
    produs("a", { page_sections: spec([["Certificari", "EN 388"]]) }),
    produs("b", { page_sections: spec([["Certificari", "EN 388"]]) }),
    produs("c", { page_sections: spec([["Certificari", "EN 374"]]) }),
    produs("d", { page_sections: spec([["Certificari", "EN 374"]]) }),
  ];
  const { fatete } = construiesteFatete(randuri);
  assert.equal(fatete.length, 1);
  assert.equal(fatete[0].cheie, "s.Certificari");
  assert.equal(fatete[0].grup, "specificatie");
  assert.deepEqual(fatete[0].valori, [
    { valoare: "EN 374", cate: 2 },
    { valoare: "EN 388", cate: 2 },
  ]);
});

test("o fateta ramasa cu o singura valoare cade", () => {
  // „Fabricat in": 6 produse, o singura valoare. Nu e o alegere.
  const randuri = ["a", "b", "c"].map((id) => produs(id, { page_sections: spec([["Fabricat in", "Romania"]]) }));
  assert.deepEqual(construiesteFatete(randuri).fatete, []);
});

test("etichetele multiple per produs nu sunt confundate cu identificatori", () => {
  /*
   * Regula pe raport valori/produse ar fi aruncat exact cazul asta: la un magazin
   * real, 81 de etichete distincte pe 44 de produse dau un raport de 1,84 fara ca
   * etichetele sa fie identificatori. Ce conteaza e cate produse are o valoare.
   */
  const randuri = [
    produs("a", { tags: ["ARDON", "Textile", "unicat-a"] }),
    produs("b", { tags: ["ARDON", "Textile", "unicat-b"] }),
    produs("c", { tags: ["ARDON", "unicat-c"] }),
  ];
  const { fatete } = construiesteFatete(randuri);
  assert.equal(fatete.length, 1);
  assert.equal(fatete[0].cheie, "tag");
  // Valorile aparute o singura data au cazut; cele comune au ramas.
  assert.deepEqual(fatete[0].valori, [
    { valoare: "ARDON", cate: 3 },
    { valoare: "Textile", cate: 2 },
  ]);
});

test("optiunile de varianta si specificatiile cu acelasi nume nu se amesteca", () => {
  const randuri = [
    produs("a", { page_sections: { ...varianta("Material", ["Bumbac"]), ...spec([["Material", "Piele"]]) } }),
    produs("b", { page_sections: { ...varianta("Material", ["Bumbac"]), ...spec([["Material", "Piele"]]) } }),
    produs("c", { page_sections: { ...varianta("Material", ["Poliester"]), ...spec([["Material", "Cauciuc"]]) } }),
    produs("d", { page_sections: { ...varianta("Material", ["Poliester"]), ...spec([["Material", "Cauciuc"]]) } }),
  ];
  const { fatete } = construiesteFatete(randuri);
  const chei = fatete.map((f) => f.cheie).sort();
  assert.deepEqual(chei, ["a.Material", "s.Material"]);
});

test("variantele stinse nu produc fatete", () => {
  // Acelasi test ca la filtrele de azi: `enabled` false inseamna produs simplu.
  const randuri = ["a", "b"].map((id) =>
    produs(id, { page_sections: { variants: { enabled: false, options: [{ id: "m", name: "Marime", values: ["M"] }] } } }),
  );
  assert.deepEqual(construiesteFatete(randuri).fatete, []);
});

test("valorile prea lungi sunt sarite, dar produsul ramane in catalog", () => {
  // „Norme" are in productie valori de pana la 149 de caractere: insiruiri de
  // standarde, nu valori de bifat.
  const lunga = "EN ISO 20345:2011 S3 SRC HRO HI CI WR M AN, EN ISO 20347:2012 OB, plus altele";
  const randuri = [
    produs("a", { page_sections: spec([["Norme", lunga], ["Gramaj", "260 g"]]) }),
    produs("b", { page_sections: spec([["Norme", lunga], ["Gramaj", "260 g"]]) }),
    produs("c", { page_sections: spec([["Gramaj", "300 g"]]) }),
    produs("d", { page_sections: spec([["Gramaj", "300 g"]]) }),
  ];
  const { fatete, perProdus } = construiesteFatete(randuri);
  assert.deepEqual(fatete.map((f) => f.cheie), ["s.Gramaj"]);
  assert.ok(perProdus.has("a"));
});

test("brandul devine o fateta proprie", () => {
  const randuri = [
    produs("a", { page_sections: { google: { brand: "ARDON" } } }),
    produs("b", { page_sections: { google: { brand: "ARDON" } } }),
    produs("c", { page_sections: { google: { brand: "3M" } } }),
    produs("d", { page_sections: { google: { brand: "3M" } } }),
  ];
  const { fatete } = construiesteFatete(randuri);
  assert.equal(fatete.length, 1);
  assert.equal(fatete[0].cheie, "brand");
  assert.equal(fatete[0].eticheta, "Brand");
});

test("aceeasi valoare scrisa de doua ori la acelasi produs se numara o data", () => {
  const randuri = [
    produs("a", { page_sections: spec([["Culoare", "Rosu"], ["Culoare", " Rosu "]]) }),
    produs("b", { page_sections: spec([["Culoare", "Rosu"]]) }),
    produs("c", { page_sections: spec([["Culoare", "Albastru"]]) }),
    produs("d", { page_sections: spec([["Culoare", "Albastru"]]) }),
  ];
  const { fatete } = construiesteFatete(randuri);
  const culoare = fatete.find((f) => f.cheie === "s.Culoare");
  assert.equal(culoare?.valori.find((v) => v.valoare === "Rosu")?.cate, 2);
});

test("dictionarul contine doar jetoanele care au supravietuit", () => {
  // Jetoanele cazute n-ar fi cerute niciodata, iar fiecare in plus se inmulteste
  // cu numarul de produse care il poarta.
  const randuri = [
    produs("a", { tags: ["comun", "unicat-a"] }),
    produs("b", { tags: ["comun", "unicat-b"] }),
    produs("c", { tags: ["comun", "alt-comun"] }),
    produs("d", { tags: ["alt-comun"] }),
  ];
  const { jetoane, perProdus } = construiesteFatete(randuri);
  assert.equal(jetoane.length, 2);
  // Produsul „a" poarta doar jetonul comun; „unicat-a" a cazut.
  assert.equal(perProdus.get("a")?.length, 1);
});

test("filtrarea e SAU in interiorul fatetei si SI intre fatete", () => {
  const randuri = [
    produs("a", { page_sections: { ...varianta("Marime", ["M"]), google: { brand: "ARDON" } } }),
    produs("b", { page_sections: { ...varianta("Marime", ["L"]), google: { brand: "ARDON" } } }),
    produs("c", { page_sections: { ...varianta("Marime", ["M"]), google: { brand: "3M" } } }),
    produs("d", { page_sections: { ...varianta("Marime", ["L"]), google: { brand: "3M" } } }),
  ];
  const { jetoane, perProdus } = construiesteFatete(randuri);

  const doarMarimi = indiciSelectati({ "a.Marime": ["M", "L"] }, jetoane);
  assert.ok(["a", "b", "c", "d"].every((id) => trecefiltrele(perProdus.get(id), doarMarimi)));

  const marimeSiBrand = indiciSelectati({ "a.Marime": ["M"], brand: ["ARDON"] }, jetoane);
  assert.equal(trecefiltrele(perProdus.get("a"), marimeSiBrand), true);
  assert.equal(trecefiltrele(perProdus.get("b"), marimeSiBrand), false);
  assert.equal(trecefiltrele(perProdus.get("c"), marimeSiBrand), false);
});

test("fara nicio bifa trec toate produsele, inclusiv cele fara atribute", () => {
  const gol = indiciSelectati({}, []);
  assert.equal(trecefiltrele(undefined, gol), true);
  assert.equal(numaraSelectia({}), 0);
});

test("un filtru dintr-un link vechi, disparut din catalog, se ignora", () => {
  /*
   * Altfel un link partajat acum o luna ar intoarce zero produse dupa ce
   * comerciantul a redenumit un atribut: cheia n-ar mai avea niciun jeton, deci
   * niciun produs n-ar trece de ea.
   */
  const randuri = [
    produs("a", { tags: ["comun"] }),
    produs("b", { tags: ["comun"] }),
    produs("c", { tags: ["altul"] }),
    produs("d", { tags: ["altul"] }),
  ];
  const { jetoane, perProdus } = construiesteFatete(randuri);
  const selectie = indiciSelectati({ "s.Disparut": ["orice"] }, jetoane);
  assert.equal(selectie.size, 0);
  assert.equal(trecefiltrele(perProdus.get("a"), selectie), true);
});

test("produsele fara niciun atribut cad cand exista o bifa", () => {
  const randuri = [
    produs("a", { tags: ["comun"] }),
    produs("b", { tags: ["comun"] }),
    produs("c", { tags: ["altul"] }),
    produs("d", { tags: ["altul"] }),
    produs("fara"),
  ];
  const { jetoane, perProdus } = construiesteFatete(randuri);
  const selectie = indiciSelectati({ tag: ["comun"] }, jetoane);
  assert.equal(trecefiltrele(perProdus.get("fara"), selectie), false);
});

test("numaratoarea de filtre bifate aduna toate fatetele", () => {
  assert.equal(numaraSelectia({ "a.Marime": ["M", "L"], brand: ["ARDON"] }), 3);
});

test("brandul scris si ca atribut de marketplace si ca specificatie apare o data", () => {
  /*
   * Cazul e REAL, nu teoretic: un magazin din productie are `google.brand` si
   * specificatia „Brand" cu exact aceleasi 13 valori pe aceleasi 813 produse,
   * fiindca importul CSV le-a scris in ambele locuri. Doua filtre identice unul
   * sub altul, si niciun mod de a sterge unul.
   */
  const cu = (brand: string) => ({ google: { brand }, ...spec([["Brand", brand]]) });
  const randuri = [
    produs("a", { page_sections: cu("ARDON") }),
    produs("b", { page_sections: cu("ARDON") }),
    produs("c", { page_sections: cu("3M") }),
    produs("d", { page_sections: cu("3M") }),
  ];
  const { fatete } = construiesteFatete(randuri);
  assert.equal(fatete.length, 1);
  // Castiga sursa dedicata, nu specificatia scrisa liber.
  assert.equal(fatete[0].cheie, "brand");
});

test("doua fatete cu acelasi nume dar valori diferite raman amandoua", () => {
  // Optiunea de varianta „Material" si specificatia „Material" sunt lucruri
  // diferite; dublura se sterge doar cand SI numele SI valorile coincid.
  const randuri = [
    produs("a", { page_sections: { ...varianta("Material", ["Bumbac"]), ...spec([["Material", "Piele"]]) } }),
    produs("b", { page_sections: { ...varianta("Material", ["Bumbac"]), ...spec([["Material", "Piele"]]) } }),
    produs("c", { page_sections: { ...varianta("Material", ["Poliester"]), ...spec([["Material", "Cauciuc"]]) } }),
    produs("d", { page_sections: { ...varianta("Material", ["Poliester"]), ...spec([["Material", "Cauciuc"]]) } }),
  ];
  assert.equal(construiesteFatete(randuri).fatete.length, 2);
});

test("jetoanele fatetei sterse nu raman in dictionar", () => {
  // Altfel produsele ar purta indici catre valori pe care nimeni nu le poate bifa.
  const cu = (brand: string) => ({ google: { brand }, ...spec([["Brand", brand]]) });
  const randuri = [
    produs("a", { page_sections: cu("ARDON") }),
    produs("b", { page_sections: cu("ARDON") }),
    produs("c", { page_sections: cu("3M") }),
    produs("d", { page_sections: cu("3M") }),
  ];
  const { jetoane, perProdus } = construiesteFatete(randuri);
  assert.equal(jetoane.length, 2);
  assert.equal(perProdus.get("a")?.length, 1);
});
