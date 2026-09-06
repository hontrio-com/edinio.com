import test from "node:test";
import assert from "node:assert/strict";
import {
  citesteExpresie, citesteNod, citesteDefinitie, citesteConditie,
  citesteActiune, citesteReguli, citestePretuire, citesteContinut,
} from "./citeste";
import { MAX_ADANCIME } from "./expresii";
import { MAX_NODURI, VERSIUNE_SCHEMA } from "./definitie";
import { evalueaza } from "./expresii";

/* ── Expresii ────────────────────────────────────────────────────────────── */

test("o formula intreaga se citeste si chiar se poate calcula", () => {
  const e = citesteExpresie({
    k: "bin", op: "inmultesc",
    a: { k: "ref", id: "l" },
    b: { k: "numar", v: 2 },
  });
  assert.ok(e);
  const r = evalueaza(e, { valori: new Map([["l", 21]]) });
  assert.ok(r.ok);
  assert.equal(r.v, 42);
});

test("ce nu se intelege se ARUNCA, nu se repara pe jumatate", () => {
  assert.equal(citesteExpresie(null), null);
  assert.equal(citesteExpresie("sir"), null);
  assert.equal(citesteExpresie({ k: "radical", a: { k: "numar", v: 4 } }), null);
  assert.equal(citesteExpresie({ k: "numar", v: "12" }), null, "numarul ca sir nu trece");
  assert.equal(citesteExpresie({ k: "numar", v: Number.NaN }), null);
  assert.equal(citesteExpresie({ k: "ref" }), null, "referinta fara id");
  assert.equal(citesteExpresie({ k: "bin", op: "adun", a: { k: "numar", v: 1 } }), null, "lipseste b");
  assert.equal(citesteExpresie({ k: "bin", op: "ridic", a: { k: "numar", v: 1 }, b: { k: "numar", v: 2 } }), null);
});

test("un PAS de rotunjire prezent DAR nevalid strica toata formula", () => {
  /*
   * Ignorat, ar fi schimbat tacit intelesul: dintr-o rotunjire la 5 lei intr-una la intreg.
   * Comerciantul ar fi vazut alt pret decat cel scris in formular, fara nicio eroare.
   */
  assert.equal(citesteExpresie({ k: "rot", op: "insus", a: { k: "numar", v: 1 }, pas: "cinci" }), null);
  assert.ok(citesteExpresie({ k: "rot", op: "insus", a: { k: "numar", v: 1 }, pas: { k: "numar", v: 5 } }));
  assert.ok(citesteExpresie({ k: "rot", op: "insus", a: { k: "numar", v: 1 } }), "fara pas e legitim");
});

test("un arbore prea adanc se refuza la CITIRE, nu doar la evaluare", () => {
  // Altfel un arbore de zece mii de niveluri ar fi doborat stiva chiar in functia care-l refuza.
  let e: unknown = { k: "numar", v: 1 };
  for (let i = 0; i < MAX_ADANCIME + 5; i++) e = { k: "neg", a: e };
  assert.equal(citesteExpresie(e), null);
});

/* ── Noduri ──────────────────────────────────────────────────────────────── */

test("un nod de alegere se citeste cu tot cu optiuni", () => {
  const n = citesteNod({
    fel: "alegere", control: "lista", id: "mat", eticheta: "Material",
    optiuni: [
      { id: "a", eticheta: "Standard", pret: 0 },
      { id: "b", eticheta: "Premium", pret: 40, activa: false },
      { id: "", eticheta: "Fara id" },
      "gunoi",
    ],
  });
  assert.ok(n && n.fel === "alegere");
  assert.equal(n.optiuni.length, 2, "optiunile stricate se scot");
  assert.equal(n.optiuni[1].activa, false);
  assert.equal(n.optiuni[1].pret, 40);
});

test("un CONTROL care nu se potriveste cu felul nodului il refuza", () => {
  assert.equal(citesteNod({ fel: "alegere", control: "glisor", id: "x", eticheta: "X", optiuni: [] }), null);
  assert.ok(citesteNod({ fel: "numar", control: "glisor", id: "x", eticheta: "X" }));
});

test("nodurile fara ID se scot: fara identitate n-ai ce pastra", () => {
  assert.equal(citesteNod({ fel: "text", control: "scurt", eticheta: "X" }), null);
});

test("⚠ NUMELE GOL NU STERGE NODUL", () => {
  /*
   * Cititorul intorcea `null` pentru un nod fara nume, iar `salveazaCiorna` scrie CE A CITIT.
   * Deci comerciantul care sterge numele ca sa-l rescrie pierdea, dupa 1,2 secunde de autosalvare,
   * TOT nodul: felul lui, pretul, optiunile, limitele si regulile care trimiteau la el. Sub
   * degete, in timp ce tasta, si fara niciun mesaj.
   *
   * Identitatea e `id`, nu numele. Iar publicarea refuza deja un nume gol, deci nimic gol nu
   * ajunge in vanzare: cititorul pastreaza, validatorul refuza.
   */
  const gol = citesteNod({ fel: "text", control: "scurt", id: "x" });
  assert.equal(gol?.id, "x");
  assert.equal(gol?.eticheta, "");

  const spatii = citesteNod({ fel: "text", control: "scurt", id: "x", eticheta: "   " });
  assert.equal(spatii?.id, "x");
  assert.equal(spatii?.eticheta, "");
});

test("⚠ si o OPTIUNE fara nume ramane, din acelasi motiv", () => {
  const c = citesteContinut({
    definitie: { versiuneSchema: 1, mod: "auto", pasi: [{ id: "p", eticheta: "P", grupuri: [{
      id: "g", noduri: [{ fel: "alegere", control: "lista", id: "n", eticheta: "N",
        optiuni: [{ id: "o1", eticheta: "Buna" }, { id: "o2" }] }],
    }] }] },
  });
  const noduri = c.definitie.pasi[0].grupuri[0].noduri;
  const optiuni = (noduri[0] as { optiuni?: { id: string; eticheta: string }[] }).optiuni ?? [];
  assert.deepEqual(optiuni.map((o) => o.id), ["o1", "o2"], "optiunea fara nume nu se pierde");
  assert.equal(optiuni[1].eticheta, "");
});

test("un fel de nod NECUNOSCUT dispare, nu se randeaza gol", () => {
  /*
   * Scris de un panou mai nou decat codul care il citeste. Pastrat, ar fi ajuns un camp pe care
   * cumparatorul il vede si nu-l poate completa.
   */
  assert.equal(citesteNod({ fel: "holograma", control: "3d", id: "x", eticheta: "X" }), null);
});

test("un nod de calcul fara formula valida se scoate", () => {
  assert.equal(citesteNod({ fel: "calcul", id: "s", eticheta: "S" }), null);
  assert.equal(citesteNod({ fel: "calcul", id: "s", eticheta: "S", formula: { k: "gresit" } }), null);
  assert.ok(citesteNod({ fel: "calcul", id: "s", eticheta: "S", formula: { k: "numar", v: 1 } }));
});

test("unitatile necunoscute se scot, cele bune raman", () => {
  const bun = citesteNod({ fel: "numar", control: "camp", id: "l", eticheta: "L", unitate: "cm" });
  assert.ok(bun && bun.fel === "numar" && bun.unitate === "cm");
  const rau = citesteNod({ fel: "numar", control: "camp", id: "l", eticheta: "L", unitate: "inch" });
  assert.ok(rau && rau.fel === "numar" && rau.unitate === undefined);
});

/* ── Definitia ───────────────────────────────────────────────────────────── */

test("o definitie intreaga se citeste", () => {
  const d = citesteDefinitie({
    versiuneSchema: 1, mod: "pasi",
    pasi: [{
      id: "p1", eticheta: "Dimensiune",
      grupuri: [{
        id: "g1", rol: "dimensiuni", proportieLegata: true,
        noduri: [{ fel: "numar", control: "camp", id: "l", eticheta: "Latime" }],
        asezari: [{ eticheta: "100 x 70", valori: { l: 1000, h: 700 } }],
      }],
    }],
    calcule: { s: { k: "bin", op: "inmultesc", a: { k: "ref", id: "l" }, b: { k: "numar", v: 2 } } },
  });
  assert.equal(d.mod, "pasi");
  assert.equal(d.pasi.length, 1);
  assert.equal(d.pasi[0].grupuri[0].rol, "dimensiuni");
  assert.equal(d.pasi[0].grupuri[0].proportieLegata, true);
  assert.deepEqual(d.pasi[0].grupuri[0].asezari, [{ eticheta: "100 x 70", valori: { l: 1000, h: 700 } }]);
  assert.ok(d.calcule?.s);
});

test("gunoiul complet da o definitie GOALA, nu o eroare", () => {
  for (const rau of [null, undefined, 5, "sir", [], { pasi: "nu-i vector" }]) {
    const d = citesteDefinitie(rau);
    assert.deepEqual(d.pasi, []);
    assert.equal(d.mod, "auto");
    assert.equal(d.versiuneSchema, VERSIUNE_SCHEMA);
  }
});

test("o versiune de schema mai NOUA se plafoneaza la ce intelegem", () => {
  assert.equal(citesteDefinitie({ versiuneSchema: 99 }).versiuneSchema, VERSIUNE_SCHEMA);
  assert.equal(citesteDefinitie({ versiuneSchema: 1 }).versiuneSchema, 1);
});

test("plafonul de noduri se respecta peste TOATA definitia, nu pe grup", () => {
  const noduri = Array.from({ length: 100 }, (_, i) =>
    ({ fel: "text", control: "scurt", id: `n${i}`, eticheta: `N${i}` }));
  const grupuri = Array.from({ length: 10 }, (_, g) => ({ id: `g${g}`, noduri }));
  const d = citesteDefinitie({ pasi: [{ id: "p", eticheta: "P", grupuri }] });
  const cate = d.pasi.reduce((s, p) => s + p.grupuri.reduce((t, g) => t + g.noduri.length, 0), 0);
  assert.ok(cate <= MAX_NODURI, `au trecut ${cate}`);
});

/* ── Conditii si actiuni ─────────────────────────────────────────────────── */

test("conditiile se citesc, cu tot cu grupari", () => {
  const c = citesteConditie({
    c: "si",
    din: [{ c: "este", nod: "mat", v: "prem" }, { c: "cmp", nod: "l", op: ">", v: 100 }],
  });
  assert.ok(c && c.c === "si" && c.din.length === 2);
});

test("o grupare GOALA se scoate, fiindca ar minti in ambele sensuri", () => {
  /*
   * `si` peste nimic e adevarat si ar fi aprins regula mereu; `sau` peste nimic e fals si ar fi
   * stins-o. Amandoua tacut.
   */
  assert.equal(citesteConditie({ c: "si", din: [] }), null);
  assert.equal(citesteConditie({ c: "sau", din: ["gunoi"] }), null);
});

test("conditiile stricate se scot", () => {
  assert.equal(citesteConditie({ c: "cmp", nod: "l", op: "~", v: 1 }), null);
  assert.equal(citesteConditie({ c: "cmp", nod: "l", op: ">", v: "zece" }), null);
  assert.equal(citesteConditie({ c: "intre", nod: "l", min: 1 }), null);
  assert.equal(citesteConditie({ c: "de-maine", nod: "l" }), null);
  assert.equal(citesteConditie({ c: "este", v: "x" }), null, "fara nod");
});

test("actiunile se citesc, si cele stricate se scot", () => {
  assert.deepEqual(citesteActiune({ a: "ascunde", tinta: "x" }), { a: "ascunde", tinta: "x" });
  assert.deepEqual(citesteActiune({ a: "min", tinta: "l", v: 500 }), { a: "min", tinta: "l", v: 500 });
  assert.equal(citesteActiune({ a: "min", tinta: "l" }), null);
  assert.equal(citesteActiune({ a: "ascunde" }), null);
  assert.equal(citesteActiune({ a: "doar_optiunile", tinta: "m", optiuni: [] }), null);
  assert.equal(citesteActiune({ a: "opreste" }), null, "oprirea fara motiv scris");
  assert.deepEqual(citesteActiune({ a: "opreste", text: "Prea mare." }), { a: "opreste", text: "Prea mare." });
});

test("o regula FARA nicio actiune valida se scoate cu totul", () => {
  /*
   * Pastrata, ar fi aparut in lista din panou ca o regula care „exista si nu face nimic", si
   * nimeni n-ar fi stiut de ce.
   */
  const r = citesteReguli([
    { id: "buna", cand: { c: "completat", nod: "x" }, atunci: [{ a: "ascunde", tinta: "y" }] },
    { id: "goala", cand: { c: "completat", nod: "x" }, atunci: [{ a: "min", tinta: "l" }] },
    { id: "faraCand", atunci: [{ a: "ascunde", tinta: "y" }] },
  ]);
  assert.deepEqual(r.map((x) => x.id), ["buna"]);
});

/* ── Pretuirea ───────────────────────────────────────────────────────────── */

test("pretuirea se citeste intreaga", () => {
  const p = citestePretuire({
    baza: "taxa", taxaInitiala: 25,
    formula: { k: "ref", id: "s" },
    minim: 50, maxim: 5000,
    rotunjire: { fel: "insus", pas: 5 },
    modificatori: [
      { id: "m1", fel: "fix", valoare: 10, eticheta: "Manopera" },
      { id: "m2", fel: "procent", valoare: 10, baza: "subtotal" },
    ],
  });
  assert.equal(p.baza, "taxa");
  assert.equal(p.taxaInitiala, 25);
  assert.deepEqual(p.rotunjire, { fel: "insus", pas: 5 });
  assert.equal(p.modificatori?.length, 2);
  assert.equal(p.modificatori?.[1].baza, "subtotal");
});

test("un modificator FARA nicio sursa de suma se scoate", () => {
  /*
   * Pastrat, ar fi valorat zero — adica ar fi aratat in descompunere ca „se aplica" fara sa
   * schimbe nimic, iar comerciantul ar fi cautat greseala in alta parte.
   */
  const p = citestePretuire({ modificatori: [{ id: "gol", fel: "fix" }, { id: "bun", fel: "fix", valoare: 5 }] });
  assert.deepEqual(p.modificatori?.map((m) => m.id), ["bun"]);
});

test("o rotunjire cu pas zero sau negativ se scoate", () => {
  assert.equal(citestePretuire({ rotunjire: { fel: "insus", pas: 0 } }).rotunjire, undefined);
  assert.equal(citestePretuire({ rotunjire: { fel: "insus", pas: -5 } }).rotunjire, undefined);
  assert.equal(citestePretuire({ rotunjire: { fel: "altfel", pas: 5 } }).rotunjire, undefined);
});

test("baza necunoscuta cade pe `produs`, purtarea obisnuita", () => {
  assert.equal(citestePretuire({ baza: "de-maine" }).baza, "produs");
  assert.equal(citestePretuire({}).baza, "produs");
  assert.equal(citestePretuire({ baza: "fara" }).baza, "fara");
});

/* ── Continutul intreg ───────────────────────────────────────────────────── */

test("continutul se citeste chiar si dintr-o coloana goala", () => {
  const c = citesteContinut({});
  assert.deepEqual(c.definitie.pasi, []);
  assert.deepEqual(c.reguli, []);
  assert.equal(c.pretuire.baza, "produs");
});

test("continutul se citeste si cand coloana e gunoi curat", () => {
  for (const rau of [null, "sir", 42, []]) {
    const c = citesteContinut(rau);
    assert.deepEqual(c.definitie.pasi, []);
    assert.deepEqual(c.reguli, []);
  }
});

test("dus si intors: ce se scrie se citeste la fel", () => {
  const original = {
    definitie: {
      versiuneSchema: 1, mod: "simplu",
      pasi: [{ id: "p1", eticheta: "Pas", grupuri: [{ id: "g1", noduri: [
        { fel: "alegere", control: "lista", id: "mat", eticheta: "Material",
          optiuni: [{ id: "a", eticheta: "A", pret: 10 }] },
      ] }] }],
    },
    reguli: [{ id: "r", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "g1" }] }],
    pretuire: { baza: "produs", minim: 10 },
  };
  const unu = citesteContinut(original);
  // Trecut prin JSON, ca sa fie exact ce face si baza de date.
  const doi = citesteContinut(JSON.parse(JSON.stringify(unu)));
  assert.deepEqual(doi, unu, "citirea trebuie sa fie idempotenta");
});
