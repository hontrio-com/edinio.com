import assert from "node:assert/strict";
import { test } from "node:test";
import { categoriiVizibile, idCategoriiAscunse, numeCategoriiAscunse } from "./vizibilitate";

/**
 * Regulile stingerii unei categorii, probate pe forma reala din Vetdepo: un
 * arbore in care acelasi nume („Insecticide") sta in doua ramuri diferite.
 *
 * Perechea din baza, `public.categorii_ascunse(p_business)`, raspunde la aceleasi
 * intrebari pentru palierul server si pentru cautare. Cand se schimba una,
 * trebuie sa se schimbe amandoua — altfel un produs dispare din grila si ramane
 * in cautare, adica exact felul de nepotrivire pe care n-o vede nimeni.
 */

//  Deratizare            (stinsa in majoritatea testelor)
//  └ Insecticide
//  └ Raticide
//  Farmacie
//  └ Insecticide         (acelasi NUME, alta ramura)
//  Furaje
const ARBORE = [
  { id: "derat", parent_id: null, name: "Deratizare", is_active: true },
  { id: "insect-d", parent_id: "derat", name: "Insecticide", is_active: true },
  { id: "ratic", parent_id: "derat", name: "Raticide", is_active: true },
  { id: "farm", parent_id: null, name: "Farmacie", is_active: true },
  { id: "insect-f", parent_id: "farm", name: "Insecticide", is_active: true },
  { id: "furaje", parent_id: null, name: "Furaje", is_active: true },
];

function cu(id: string, isActive: boolean) {
  return ARBORE.map((c) => (c.id === id ? { ...c, is_active: isActive } : c));
}

test("fara nimic stins, nu se ascunde nimic", () => {
  assert.equal(idCategoriiAscunse(ARBORE).size, 0);
  assert.equal(numeCategoriiAscunse(ARBORE).size, 0);
  assert.deepEqual(categoriiVizibile(ARBORE), ARBORE, "aceeasi lista, neatinsa");
});

test("stinsa, o categorie isi ia SUBARBOREL cu ea, desi copiii raman aprinsi", () => {
  const ascunse = idCategoriiAscunse(cu("derat", false));
  assert.deepEqual([...ascunse].sort(), ["derat", "insect-d", "ratic"]);
});

test("un nume purtat si de o categorie aprinsa NU iese din magazin", () => {
  // „Insecticide" e si sub Deratizare (stinsa), si sub Farmacie (aprinsa).
  // Produsele nu stiu decat numele: scos, ar fi golit si raionul ramas aprins.
  const nume = numeCategoriiAscunse(cu("derat", false));
  assert.deepEqual([...nume].sort(), ["Deratizare", "Raticide"]);
  assert.equal(nume.has("Insecticide"), false);
});

test("cand toate categoriile cu acel nume sunt stinse, numele iese", () => {
  const lista = cu("derat", false).map((c) => (c.id === "insect-f" ? { ...c, is_active: false } : c));
  const nume = numeCategoriiAscunse(lista);
  assert.equal(nume.has("Insecticide"), true);
});

test("stingerea unei frunze nu atinge fratii sau parintele", () => {
  const ascunse = idCategoriiAscunse(cu("ratic", false));
  assert.deepEqual([...ascunse], ["ratic"]);
  assert.deepEqual(categoriiVizibile(cu("ratic", false)).map((c) => c.id),
    ["derat", "insect-d", "farm", "insect-f", "furaje"]);
});

test("lipsa coloanei inseamna aprinsa (randuri de dinaintea migratiei)", () => {
  const vechi = [
    { id: "a", parent_id: null, name: "A" },
    { id: "b", parent_id: "a", name: "B" },
  ];
  assert.equal(idCategoriiAscunse(vechi).size, 0);
  assert.equal(numeCategoriiAscunse(vechi).size, 0);
});

test("un ciclu de parinti nu blocheaza parcurgerea", () => {
  // Imposibil prin interfata (`moveCategory` il refuza), dar randurile pot fi
  // atinse si din consola. Padurea promoveaza ce e prins in cerc, deci fiecare
  // nod e vazut exact o data si nimic nu se invarte la nesfarsit.
  const rupt = [
    { id: "x", parent_id: "y", name: "X", is_active: false },
    { id: "y", parent_id: "x", name: "Y", is_active: true },
    { id: "z", parent_id: null, name: "Z", is_active: true },
  ];
  const ascunse = idCategoriiAscunse(rupt);
  assert.equal(ascunse.has("x"), true);
  assert.equal(ascunse.has("z"), false);
});

test("stingerea unei radacini fara copii scoate exact un nume", () => {
  const nume = numeCategoriiAscunse(cu("furaje", false));
  assert.deepEqual([...nume], ["Furaje"]);
});
