import test from "node:test";
import assert from "node:assert/strict";
import { verificaRaspunsul } from "./raspuns";
import type { Compilat } from "./compileaza";
import type { Definitie, Nod } from "./definitie";
import type { Regula } from "./reguli";
import type { Pretuire } from "./pret";

/*
 * Un configurator de rame: latime si inaltime in mm, material, gravura, si doua extraoptiuni.
 * Preturile sunt alese ca sa se poata verifica pe hartie.
 */
function definitie(noduri: Nod[]): Definitie {
  return {
    versiuneSchema: 1,
    mod: "auto",
    pasi: [{ id: "p1", eticheta: "Alege", grupuri: [{ id: "g1", noduri }] }],
  } as Definitie;
}

function cfg(noduri: Nod[], pretuire: Pretuire, reguli: Regula[] = []): Compilat {
  return { v: 1, definitie: definitie(noduri), reguli, pretuire };
}

const LATIME: Nod = { id: "l", eticheta: "Latime", fel: "numar", control: "camp", unitate: "mm", min: 100, max: 2000 } as Nod;
const MATERIAL: Nod = {
  id: "m", eticheta: "Material", fel: "alegere", control: "butoane", obligatoriu: true,
  optiuni: [
    { id: "brad", eticheta: "Brad" },
    { id: "stejar", eticheta: "Stejar", pret: 50 },
    { id: "aur", eticheta: "Aurit", pret: 500, activa: false },
  ],
} as Nod;
const GRAVURA: Nod = {
  id: "g", eticheta: "Gravura", fel: "text", control: "scurt", maxCaractere: 10,
  pret: { fix: 20 },
} as Nod;
const EXTRA: Nod = {
  id: "e", eticheta: "Extra", fel: "alegeri", control: "bifare", maxAlese: 2,
  optiuni: [
    { id: "sticla", eticheta: "Sticla", pret: 30 },
    { id: "paspartu", eticheta: "Paspartu", pret: 15 },
    { id: "agatare", eticheta: "Agatare", pret: 5 },
  ],
} as Nod;

const PRETUIRE: Pretuire = { baza: "produs" };

const PLIN = cfg([LATIME, MATERIAL, GRAVURA, EXTRA], PRETUIRE);

/* ── Drumul bun ──────────────────────────────────────────────────────────── */

test("o configuratie buna trece, si pretul e cel socotit pe hartie", () => {
  const r = verificaRaspunsul(PLIN, {
    l: { f: "numar", v: 500 },
    m: { f: "alegere", v: "stejar" },
    g: { f: "text", v: "Robert" },
    e: { f: "alegeri", v: ["sticla"] },
  }, 100);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // 100 baza + 50 stejar + 20 gravura + 30 sticla
  assert.equal(r.unitar, 200);
  assert.match(r.amprenta, /^[0-9a-z]{28}$/);
});

test("acelasi raspuns da acelasi verdict si aceeasi amprenta", () => {
  const brut = { l: { f: "numar", v: 500 }, m: { f: "alegere", v: "brad" } };
  const a = verificaRaspunsul(PLIN, brut, 100);
  const b = verificaRaspunsul(PLIN, brut, 100);
  assert.equal(a.ok && b.ok && a.amprenta === b.amprenta, true);
});

/* ── Ce se ARUNCA ────────────────────────────────────────────────────────── */

test("un camp care NU EXISTA in definitie se arunca, nu intra in amprenta", () => {
  /*
   * ⚠ Pastrat, ar fi ajuns in identitatea liniei de cos si in instantaneul comenzii: doua comenzi
   * altfel identice ar fi aratat diferit, si nimeni n-ar fi avut de unde sti de ce.
   */
  const curat = verificaRaspunsul(PLIN, { m: { f: "alegere", v: "brad" } }, 100);
  const cuGunoi = verificaRaspunsul(PLIN, {
    m: { f: "alegere", v: "brad" },
    inventat: { f: "text", v: "orice" },
  }, 100);
  assert.equal(curat.ok && cuGunoi.ok, true);
  if (!curat.ok || !cuGunoi.ok) return;
  assert.equal(cuGunoi.amprenta, curat.amprenta);
  assert.equal(cuGunoi.valori.inventat, undefined);
});

test("o valoare de ALT FEL decat nodul se arunca", () => {
  // Un numar trimis pe campul de alegere: trece de normalizare, dar nu e ce cere nodul.
  const r = verificaRaspunsul(PLIN, {
    m: { f: "numar", v: 7 },
  }, 100);
  assert.equal(r.ok, false);
  if (r.ok) return;
  // Aruncat, campul ramane necompletat — si e obligatoriu, deci se cere.
  assert.ok(r.motive.some((x) => x.idNod === "m"));
});

/* ── Ce se REFUZA, si de ce fiecare costa bani ───────────────────────────── */

test("PORTITA: o optiune STINSA nu se poate cumpara trimitand-o de-a dreptul", () => {
  /*
   * Cea mai scumpa portita din toata functia. „Aurit" e stinsa de comerciant, deci nu se vede in
   * pagina. Un cumparator care trimite chiar id-ul ei ar fi primit rama aurita — la pretul ei
   * daca optiunea mai exista, sau pe GRATIS daca fusese stearsa intre timp.
   */
  const r = verificaRaspunsul(PLIN, { m: { f: "alegere", v: "aur" } }, 100);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.motive.some((x) => x.idNod === "m"));
});

test("PORTITA: o optiune care nu exista deloc nu trece drept aleasa", () => {
  const r = verificaRaspunsul(PLIN, { m: { f: "alegere", v: "platina" } }, 100);
  assert.equal(r.ok, false);
});

test("PORTITA: o bifa care nu exista nu trece nici in multime", () => {
  const r = verificaRaspunsul(PLIN, {
    m: { f: "alegere", v: "brad" },
    e: { f: "alegeri", v: ["sticla", "diamant"] },
  }, 100);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.motive.some((x) => x.idNod === "e"));
});

test("campul OBLIGATORIU necompletat opreste comanda", () => {
  const r = verificaRaspunsul(PLIN, { l: { f: "numar", v: 500 } }, 100);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.motive.some((x) => x.idNod === "m" && x.text.includes("Material")));
});

test("un numar sub minim sau peste maxim se refuza", () => {
  const jos = verificaRaspunsul(PLIN, { l: { f: "numar", v: 50 }, m: { f: "alegere", v: "brad" } }, 100);
  const sus = verificaRaspunsul(PLIN, { l: { f: "numar", v: 90000 }, m: { f: "alegere", v: "brad" } }, 100);
  assert.equal(jos.ok, false);
  assert.equal(sus.ok, false);
});

test("un text mai lung decat s-a spus se refuza", () => {
  // ⚠ Gravura nu incape pe obiect. Trecuta, atelierul afla la productie.
  const r = verificaRaspunsul(PLIN, {
    m: { f: "alegere", v: "brad" },
    g: { f: "text", v: "un text mult prea lung pentru rama asta" },
  }, 100);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.motive.some((x) => x.idNod === "g"));
});

test("prea multe bifate se refuza", () => {
  const r = verificaRaspunsul(PLIN, {
    m: { f: "alegere", v: "brad" },
    e: { f: "alegeri", v: ["sticla", "paspartu", "agatare"] },
  }, 100);
  assert.equal(r.ok, false);
});

/* ── Regulile ────────────────────────────────────────────────────────────── */

test("LIMITA PUSA DE O REGULA e o margine, nu un text pe ecran", () => {
  /*
   * ⚠ Verificate numai limitele din definitie, o regula care stramteaza intervalul — „la brad,
   * cel mult 1000 mm" — ar fi ramas doar o vorba: cumparatorul care trimite 2000 ar fi primit o
   * rama pe care atelierul n-o poate face.
   */
  const reguli: Regula[] = [{
    id: "r1",
    cand: { c: "este", nod: "m", v: "brad" },
    atunci: [{ a: "max", tinta: "l", v: 1000 }],
  }];
  const c = cfg([LATIME, MATERIAL], PRETUIRE, reguli);

  const bun = verificaRaspunsul(c, { l: { f: "numar", v: 900 }, m: { f: "alegere", v: "brad" } }, 100);
  const rau = verificaRaspunsul(c, { l: { f: "numar", v: 1500 }, m: { f: "alegere", v: "brad" } }, 100);
  assert.equal(bun.ok, true, "sub limita regulii");
  assert.equal(rau.ok, false, "peste limita regulii, desi definitia ar fi permis");
});

test("o OPRIRE pusa de comerciant se arata ca atare", () => {
  const reguli: Regula[] = [{
    id: "r1",
    cand: { c: "este", nod: "m", v: "brad" },
    atunci: [{ a: "opreste", text: "Bradul s-a terminat." }],
  }];
  const r = verificaRaspunsul(cfg([MATERIAL], PRETUIRE, reguli), { m: { f: "alegere", v: "brad" } }, 100);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.motive.some((x) => x.text === "Bradul s-a terminat."));
});

test("un camp ASCUNS de o regula nu blocheaza, chiar daca e obligatoriu", () => {
  /*
   * Altfel comanda ar fi fost oprita de un camp pe care cumparatorul nu-l vede si pe care n-are
   * cum sa-l completeze — un butoane care nu se aprinde niciodata, fara nicio explicatie.
   */
  const reguli: Regula[] = [{
    id: "r1",
    cand: { c: "pornit", nod: "c" },
    atunci: [{ a: "ascunde", tinta: "m" }],
  }];
  const comutator: Nod = { id: "c", eticheta: "Simplu", fel: "comutator", control: "comutator" } as Nod;
  const r = verificaRaspunsul(cfg([comutator, MATERIAL], PRETUIRE, reguli), {
    c: { f: "comutator", v: true },
  }, 100);
  assert.equal(r.ok, true);
});

test("un camp ascuns NU PLATESTE, chiar daca valoarea lui a fost trimisa", () => {
  // ⚠ Altfel se plateste un supliment pe care omul nu-l vede si nu l-a ales.
  const reguli: Regula[] = [{
    id: "r1",
    cand: { c: "pornit", nod: "c" },
    atunci: [{ a: "ascunde", tinta: "e" }],
  }];
  const comutator: Nod = { id: "c", eticheta: "Simplu", fel: "comutator", control: "comutator" } as Nod;
  const c = cfg([comutator, EXTRA], PRETUIRE, reguli);
  const r = verificaRaspunsul(c, {
    c: { f: "comutator", v: true },
    e: { f: "alegeri", v: ["sticla"] },
  }, 100);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.unitar, 100, "doar baza; sticla era ascunsa");
  assert.equal(r.valori.e, undefined, "si nu intra nici in amprenta");
});

/* ── Pretul ──────────────────────────────────────────────────────────────── */

test("pretul produsului vine de la SERVER, nu din raspuns", () => {
  // Acelasi raspuns, doua preturi de catalog: iese exact ce a dat catalogul.
  const brut = { m: { f: "alegere", v: "stejar" } };
  const a = verificaRaspunsul(PLIN, brut, 100);
  const b = verificaRaspunsul(PLIN, brut, 300);
  assert.equal(a.ok && a.unitar, 150);
  assert.equal(b.ok && b.unitar, 350);
});

test("cand pretul nu se poate calcula NU se cade pe pretul de baza", () => {
  /*
   * ⚠ Vandut la pretul de baza, s-ar fi dat gratis tot ce a configurat omul. Un pret negativ e
   * refuzat de motor; aici se verifica faptul ca refuzul ajunge pana sus, nu ca devine 100.
   */
  const rea: Pretuire = { baza: "produs", modificatori: [
    { id: "x", eticheta: "Scade", fel: "fix", valoare: -1000 },
  ] };
  const r = verificaRaspunsul(cfg([MATERIAL], rea), { m: { f: "alegere", v: "brad" } }, 100);
  assert.equal(r.ok, false);
});

test("un configurator GOL nu opreste nimic si nu schimba pretul", () => {
  const r = verificaRaspunsul(cfg([], PRETUIRE), {}, 250);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.unitar, 250);
});

test("valorile brute cu totul aiurea nu arunca", () => {
  for (const brut of [null, undefined, "text", 5, [], { m: 3 }, { m: { f: "necunoscut" } }]) {
    assert.doesNotThrow(() => verificaRaspunsul(PLIN, brut, 100));
  }
});
