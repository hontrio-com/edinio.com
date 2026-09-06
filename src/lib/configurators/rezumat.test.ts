import test from "node:test";
import assert from "node:assert/strict";
import { caUnRand, rezumatConfiguratiei, rezumatScurt } from "./rezumat";
import { verdictulLiniei } from "./repretuire";
import { normalizeazaValori } from "./valori";
import type { Compilat } from "./compileaza";
import type { Nod } from "./definitie";

const NODURI: Nod[] = [
  { id: "l", eticheta: "Latime", fel: "numar", control: "camp", unitate: "cm", inRezumat: true } as Nod,
  { id: "greutate", eticheta: "Greutate", fel: "numar", control: "camp", unitate: "kg" } as Nod,
  { id: "buc", eticheta: "Bucati", fel: "numar", control: "camp" } as Nod,
  {
    id: "m", eticheta: "Material", fel: "alegere", control: "butoane", inRezumat: true,
    optiuni: [{ id: "brad", eticheta: "Brad" }, { id: "stejar", eticheta: "Stejar" }],
  } as Nod,
  {
    id: "e", eticheta: "Extra", fel: "alegeri", control: "bifare",
    optiuni: [{ id: "sticla", eticheta: "Sticla" }, { id: "agatare", eticheta: "Agatare" }],
  } as Nod,
  { id: "g", eticheta: "Gravura", fel: "text", control: "scurt" } as Nod,
  { id: "cadou", eticheta: "Ambalaj cadou", fel: "comutator", control: "comutator" } as Nod,
];

const CFG: Compilat = {
  v: 1,
  definitie: {
    versiuneSchema: 1, mod: "auto",
    pasi: [{ id: "p1", eticheta: "Alege", grupuri: [{ id: "g1", noduri: NODURI }] }],
  },
  reguli: [],
  pretuire: { baza: "produs" },
} as Compilat;

const v = (o: Record<string, unknown>) => normalizeazaValori(o);

test("numerele se scriu in UNITATEA COMERCIANTULUI, nu in cea de baza", () => {
  /*
   * ⚠ Motorul tine milimetri si grame. „3500" pe o comanda de rame nu inseamna nimic pentru
   * atelier; „350 cm" inseamna. Scris in unitatea de baza, cineva ar fi taiat de zece ori mai
   * mult sau de zece ori mai putin.
   */
  const r = rezumatConfiguratiei(CFG, v({ l: { f: "numar", v: 3500 } }));
  assert.deepEqual(r.map((x) => x.valoare), ["350 cm"]);
});

test("si masele la fel", () => {
  const r = rezumatConfiguratiei(CFG, v({ greutate: { f: "numar", v: 2500 } }));
  assert.deepEqual(r.map((x) => x.valoare), ["2.5 kg"]);
});

test("fara unitate, numarul se scrie gol", () => {
  const r = rezumatConfiguratiei(CFG, v({ buc: { f: "numar", v: 3 } }));
  assert.deepEqual(r.map((x) => x.valoare), ["3"]);
});

test("alegerile se scriu cu ETICHETA, nu cu id-ul", () => {
  // ⚠ `opt_7f2` nu spune nimic nimanui. Comanda o citeste un om.
  const r = rezumatConfiguratiei(CFG, v({ m: { f: "alegere", v: "stejar" } }));
  assert.deepEqual(r, [{ id: "m", eticheta: "Material", valoare: "Stejar", scurt: true }]);
});

test("bifele multiple se insira", () => {
  const r = rezumatConfiguratiei(CFG, v({ e: { f: "alegeri", v: ["agatare", "sticla"] } }));
  // Normalizarea le sorteaza, deci ordinea e mereu aceeasi.
  assert.equal(r[0].valoare, "Agatare, Sticla");
});

test("comutatorul se scrie „Da”, nu „true”", () => {
  const r = rezumatConfiguratiei(CFG, v({ cadou: { f: "comutator", v: true } }));
  assert.deepEqual(r.map((x) => x.valoare), ["Da"]);
});

test("ORDINEA e cea din definitie, nu cea a cheilor din obiect", () => {
  /*
   * ⚠ O comanda in care campurile sar de la o linie la alta se citeste mai greu decat una lunga.
   * Ordinea obiectului e o intamplare a browserului; cea din definitie e ce a vazut omul.
   */
  const r = rezumatConfiguratiei(CFG, v({
    cadou: { f: "comutator", v: true },
    m: { f: "alegere", v: "brad" },
    l: { f: "numar", v: 1000 },
  }));
  assert.deepEqual(r.map((x) => x.id), ["l", "m", "cadou"]);
});

test("campurile necompletate nu apar deloc", () => {
  const r = rezumatConfiguratiei(CFG, v({ m: { f: "alegere", v: "brad" } }));
  assert.equal(r.length, 1);
});

test("o optiune care nu mai exista se scrie cu id-ul, nu se pierde randul", () => {
  /*
   * ⚠ Sarit, comanda ar fi aratat mai putin decat s-a cumparat — si nimeni n-ar fi avut de unde
   * sti ca lipseste ceva.
   */
  const r = rezumatConfiguratiei(CFG, v({ m: { f: "alegere", v: "stearsa" } }));
  assert.deepEqual(r.map((x) => x.valoare), ["stearsa"]);
});

test("rezumatul SCURT ia campurile marcate, si cade pe toate cand nu e niciunul", () => {
  const plin = rezumatConfiguratiei(CFG, v({
    l: { f: "numar", v: 1000 }, m: { f: "alegere", v: "brad" }, g: { f: "text", v: "Ana" },
  }));
  assert.deepEqual(rezumatScurt(plin).map((x) => x.id), ["l", "m"]);

  const doarNemarcate = rezumatConfiguratiei(CFG, v({ g: { f: "text", v: "Ana" } }));
  assert.deepEqual(rezumatScurt(doarNemarcate).map((x) => x.id), ["g"]);
});

test("rezumatul scurt nu trece de maxim", () => {
  const plin = rezumatConfiguratiei(CFG, v({
    g: { f: "text", v: "Ana" }, buc: { f: "numar", v: 2 }, cadou: { f: "comutator", v: true },
    e: { f: "alegeri", v: ["sticla"] },
  }));
  assert.equal(rezumatScurt(plin, 2).length, 2);
});

test("un rand pentru email sau eticheta", () => {
  const r = rezumatConfiguratiei(CFG, v({ l: { f: "numar", v: 1000 }, m: { f: "alegere", v: "brad" } }));
  assert.equal(caUnRand(r), "Latime: 100 cm · Material: Brad");
});

/* ── Verdictul de linie ──────────────────────────────────────────────────── */

test("fara configurator, valorile trimise se IGNORA", () => {
  /*
   * ⚠ Se intampla firesc: produsul era configurabil cand a intrat in cos, si comerciantul l-a
   * dezlegat intre timp. Pastrate, valorile ar fi intrat in comanda ca o specificatie pe care
   * nimeni n-o mai poate citi — si care n-a fost platita.
   */
  const r = verdictulLiniei(undefined, { m: { f: "alegere", v: "brad" } }, 100);
  assert.deepEqual(r, { fel: "fara" });
});

test("cu configurator dar fara identitate, tot se ignora", () => {
  // Cele doua vin mereu impreuna; daca vreodata n-ar veni, nu se scrie o comanda pe jumatate.
  const r = verdictulLiniei(CFG, { m: { f: "alegere", v: "brad" } }, 100);
  assert.deepEqual(r, { fel: "fara" });
});

test("o linie buna intoarce pretul, amprenta SI rezumatul", () => {
  const identitate = { configuratorId: "c1", versiuneId: "v1", numarVersiune: 3 };
  const r = verdictulLiniei(CFG, { m: { f: "alegere", v: "brad" }, l: { f: "numar", v: 1000 } }, 100, identitate);
  assert.equal(r.fel, "ok");
  if (r.fel !== "ok") return;
  assert.equal(r.unitar, 100);
  assert.equal(r.configuratorId, "c1");
  assert.equal(r.numarVersiune, 3);
  assert.deepEqual(r.rezumat.map((x) => x.valoare), ["100 cm", "Brad"]);
  assert.match(r.amprenta, /^[0-9a-z]{28}$/);
});

test("o linie REFUZATA nu se vinde la pretul de baza", () => {
  /*
   * ⚠ Aici e inversul vitrinei. Pe pagina, orice necaz inseamna „produsul se vinde simplu". La
   * plasarea comenzii, trecuta mai departe la pretul de baza, linia ar fi dat gratis tot ce a
   * configurat cumparatorul — si comanda ar fi ajuns in atelier fara specificatie.
   */
  const cerut = { ...CFG, definitie: { ...CFG.definitie,
    pasi: [{ id: "p1", eticheta: "Alege", grupuri: [{ id: "g1", noduri: [
      { id: "m", eticheta: "Material", fel: "alegere", control: "butoane", obligatoriu: true,
        optiuni: [{ id: "brad", eticheta: "Brad" }] } as Nod,
    ] }] }] } } as Compilat;
  const r = verdictulLiniei(cerut, {}, 100, { configuratorId: "c1", versiuneId: "v1", numarVersiune: 1 });
  assert.equal(r.fel, "refuz");
  if (r.fel !== "refuz") return;
  assert.ok(r.motive.length > 0, "si se spune de ce, nu doar ca nu");
});
