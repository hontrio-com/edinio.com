import test from "node:test";
import assert from "node:assert/strict";
import { pretulDePornire } from "./pornire";
import { etichetaDePornire } from "./eticheta-pornire";
import type { Compilat } from "./compileaza";
import type { Definitie, Nod } from "./definitie";
import type { Pretuire } from "./pret";

/* ── Schele ──────────────────────────────────────────────────────────────── */

function definitie(noduri: Nod[]): Definitie {
  return {
    versiuneSchema: 1,
    mod: "auto",
    pasi: [{ id: "p1", eticheta: "Alege", grupuri: [{ id: "g1", noduri }] }],
  } as Definitie;
}

function cfg(noduri: Nod[], pretuire: Pretuire = { baza: "produs" }): Compilat {
  return { v: 1, definitie: definitie(noduri), reguli: [], pretuire };
}

/** Material fara implicit si NEobligatoriu: pagina se deschide fara nimic ales. */
const MATERIAL_LIBER: Nod = {
  id: "m", eticheta: "Material", fel: "alegere", control: "butoane",
  optiuni: [
    { id: "brad", eticheta: "Brad" },
    { id: "stejar", eticheta: "Stejar", pret: 50 },
  ],
} as Nod;

/** Acelasi material, dar comerciantul a pus stejarul ca implicit. */
const MATERIAL_IMPLICIT_SCUMP: Nod = { ...MATERIAL_LIBER, implicit: "stejar" } as Nod;

/** Gravura obligatorie, fara implicit: nu exista niciun pret la care se poate cumpara. */
const GRAVURA_OBLIGATORIE: Nod = {
  id: "g", eticheta: "Gravura", fel: "text", control: "scurt", obligatoriu: true,
  maxCaractere: 10, pret: { fix: 20 },
} as Nod;

/* ── PRETUL DE PORNIRE ───────────────────────────────────────────────────── */

test("implicitul gol da chiar pretul produsului", () => {
  assert.equal(pretulDePornire(cfg([MATERIAL_LIBER]), 175), 175);
});

test("un implicit scump intra in pretul de pornire", () => {
  // 175 (baza) + 50 (stejar, ales de comerciant ca implicit) = 225.
  assert.equal(pretulDePornire(cfg([MATERIAL_IMPLICIT_SCUMP]), 175), 225);
});

test("⚠ un camp obligatoriu fara implicit da `null`, NU pretul de baza", () => {
  /*
   * Aici e chiar hotararea fisierului. Pretul de baza ar fi fost 175, dar 175 nu se poate plati:
   * pagina cere gravura si abia dupa ea arata un pret. Scris pe card, ar fi fost un pret pe care
   * cumparatorul nu-l poate obtine niciodata.
   */
  assert.equal(pretulDePornire(cfg([GRAVURA_OBLIGATORIE]), 175), null);
});

test("un configurator fara nicio optiune da pretul produsului", () => {
  assert.equal(pretulDePornire(cfg([]), 89.9), 89.9);
});

test("baza „fara” socoteste numai ce aduce configuratorul, nu pretul din catalog", () => {
  const c = cfg([MATERIAL_IMPLICIT_SCUMP], { baza: "fara" });
  assert.equal(pretulDePornire(c, 175), 50);
});

test("baza „taxa” porneste de la taxa comerciantului", () => {
  const c = cfg([MATERIAL_IMPLICIT_SCUMP], { baza: "taxa", taxaInitiala: 20 });
  assert.equal(pretulDePornire(c, 175), 70);
});

test("⚠ o optiune STINSA nu poate fi implicitul, deci nu intra in pretul de pornire", () => {
  /*
   * Comerciantul a scos optiunea din vanzare dar a uitat-o ca implicit. Pretul de pornire n-are
   * voie sa fie al ei: primul cumparator ar fi vazut pe card pretul unei optiuni care nu se mai
   * poate alege pe pagina.
   */
  const nod = {
    id: "m", eticheta: "Material", fel: "alegere", control: "butoane", implicit: "aur",
    optiuni: [
      { id: "brad", eticheta: "Brad" },
      { id: "aur", eticheta: "Aurit", pret: 500, activa: false },
    ],
  } as Nod;
  assert.equal(pretulDePornire(cfg([nod]), 175), 175);
});

/* ── Ce vine stricat nu arunca ───────────────────────────────────────────── */

test("⚠ valori aiurea nu arunca, dau `null`", () => {
  const bun = cfg([MATERIAL_LIBER]);
  // Proiectorul trece prin sute de produse intr-un lot: unul stricat n-are voie sa le doboare.
  assert.equal(pretulDePornire(bun, Number.NaN), null);
  assert.equal(pretulDePornire(bun, Number.POSITIVE_INFINITY), null);
  assert.equal(pretulDePornire(null as unknown as Compilat, 100), null);
  assert.equal(pretulDePornire({} as Compilat, 100), null);
  assert.equal(pretulDePornire({ v: 1, definitie: {} } as unknown as Compilat, 100), null);
  assert.equal(
    pretulDePornire({ v: 1, definitie: definitie([MATERIAL_LIBER]) } as unknown as Compilat, 100),
    null,
    "fara `pretuire` nu se stie de la ce porneste baza, deci nu se ghiceste",
  );
  assert.equal(
    pretulDePornire(cfg([MATERIAL_LIBER]), "175" as unknown as number),
    null,
    "un pret care nu e numar nu se converteste tacut",
  );
});

/* ── ETICHETA ────────────────────────────────────────────────────────────── */

test("produsul care NU cere configurare scrie pretul exact", () => {
  assert.deepEqual(etichetaDePornire(false, null, 120), { text: "exact", valoare: 120 });
  // Chiar daca din vreun motiv are un pret de pornire, steagul e cel care hotaraste.
  assert.deepEqual(etichetaDePornire(false, 200, 120), { text: "exact", valoare: 120 });
});

test("produsul care cere configurare si are pret de pornire scrie „De la” pe pornire", () => {
  assert.deepEqual(etichetaDePornire(true, 225, 175), { text: "dela", valoare: 225 });
});

test("⚠ cere configurare dar n-are pret de pornire: tot „De la”, pe pretul simplu", () => {
  /*
   * Pretul simplu scris ca pret EXACT ar fi fost o promisiune pe care pagina o dezminte in
   * secunda urmatoare, fiindca acolo se cere intai completat ceva.
   */
  assert.deepEqual(etichetaDePornire(true, null, 175), { text: "dela", valoare: 175 });
});

test("un pret de pornire nefinit e tratat ca lipsa", () => {
  assert.deepEqual(etichetaDePornire(true, Number.NaN, 175), { text: "dela", valoare: 175 });
});

test("zero e un pret de pornire adevarat, nu o lipsa", () => {
  // Un configurator cu baza „fara” si nicio optiune implicita porneste chiar de la 0.
  assert.deepEqual(etichetaDePornire(true, 0, 175), { text: "dela", valoare: 0 });
});
