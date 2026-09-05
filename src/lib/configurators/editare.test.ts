import test from "node:test";
import assert from "node:assert/strict";
import {
  idNou, adaugaPas, adaugaGrup, adaugaNod, schimbaNod, schimbaPas, schimbaGrup,
  stergeNod, stergeGrup, stergePas, mutaPas, mutaGrup, mutaNod,
  adaugaOptiune, stergeOptiune, mutaOptiune, faraReferintaLa,
} from "./editare";
import { MAX_PASI } from "./definitie";
import type { Continut } from "./citeste";
import type { Nod } from "./definitie";
import type { Regula } from "./reguli";

const GOL: Continut = {
  definitie: { versiuneSchema: 1, mod: "auto", pasi: [] },
  reguli: [],
  pretuire: { baza: "produs" },
};

const text = (id: string): Nod => ({ fel: "text", control: "scurt", id, eticheta: id });

/** Un continut cu un pas, un grup si doua noduri, plus id-urile lor. */
function schela() {
  let c = adaugaPas(GOL, "Pas");
  const idPas = c.definitie.pasi[0].id;
  const idGrup = c.definitie.pasi[0].grupuri[0].id;
  c = adaugaNod(c, idGrup, text("a"));
  c = adaugaNod(c, idGrup, text("b"));
  return { c, idPas, idGrup };
}

/* ── Id-uri ──────────────────────────────────────────────────────────────── */

test("id-urile sunt unice, nu un contor previzibil", () => {
  /*
   * Builderul din pagini foloseste `Date.now()` cu un contor si a mai avut ciocniri: doua file
   * deschise, sau doua creari rapide, dau acelasi numar. Aici id-ul e AUTORITATEA — formulele si
   * regulile trimit la el.
   */
  const vazute = new Set<string>();
  for (let i = 0; i < 2000; i++) vazute.add(idNou());
  assert.equal(vazute.size, 2000);
});

/* ── Adaugare ────────────────────────────────────────────────────────────── */

test("un pas nou vine cu un grup gata facut", () => {
  const c = adaugaPas(GOL, "Dimensiune");
  assert.equal(c.definitie.pasi.length, 1);
  assert.equal(c.definitie.pasi[0].eticheta, "Dimensiune");
  assert.equal(c.definitie.pasi[0].grupuri.length, 1, "altfel n-ar avea unde intra prima optiune");
});

test("plafonul de pasi se respecta", () => {
  let c = GOL;
  for (let i = 0; i < MAX_PASI + 5; i++) c = adaugaPas(c);
  assert.equal(c.definitie.pasi.length, MAX_PASI);
});

test("adaugarea unei optiuni o pune in grupul cerut", () => {
  const { c, idGrup } = schela();
  assert.deepEqual(
    c.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["a", "b"],
  );
  const alt = adaugaNod(c, "grup-inexistent", text("c"));
  assert.deepEqual(alt.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["a", "b"]);
  void idGrup;
});

/* ── Nimic nu se modifica pe loc ─────────────────────────────────────────── */

test("NIMIC nu se schimba pe loc: React compara referinte", () => {
  /*
   * O structura schimbata pe loc n-ar declansa randarea, iar comerciantul ar apasa un buton care
   * „nu face nimic" — pana la urmatoarea schimbare, cand i-ar aparea toate deodata.
   */
  const { c, idGrup } = schela();
  const inainte = JSON.stringify(c);
  const dupa = adaugaNod(c, idGrup, text("nou"));
  assert.equal(JSON.stringify(c), inainte, "intrarea ramane neatinsa");
  assert.notEqual(dupa, c);
  assert.notEqual(dupa.definitie, c.definitie);
  assert.notEqual(dupa.definitie.pasi[0].grupuri[0].noduri, c.definitie.pasi[0].grupuri[0].noduri);
});

/* ── Schimbare ───────────────────────────────────────────────────────────── */

test("schimbarea unui nod ii pastreaza locul si id-ul", () => {
  const { c } = schela();
  const dupa = schimbaNod(c, { ...text("a"), eticheta: "Latime" });
  const noduri = dupa.definitie.pasi[0].grupuri[0].noduri;
  assert.equal(noduri[0].eticheta, "Latime");
  assert.deepEqual(noduri.map((n) => n.id), ["a", "b"], "ordinea nu se schimba");
});

test("id-ul nu se poate schimba prin campuri", () => {
  // Regulile si formulele trimit la el; schimbat, ar fi rupt tot ce arata spre el.
  const { c, idPas } = schela();
  const dupa = schimbaPas(c, idPas, { id: "altul", eticheta: "Alt nume" } as never);
  assert.equal(dupa.definitie.pasi[0].id, idPas);
  assert.equal(dupa.definitie.pasi[0].eticheta, "Alt nume");
});

test("grupul poate primi rolul de dimensiuni", () => {
  const { c, idGrup } = schela();
  const dupa = schimbaGrup(c, idGrup, { rol: "dimensiuni", proportieLegata: true });
  assert.equal(dupa.definitie.pasi[0].grupuri[0].rol, "dimensiuni");
});

/* ── Stergere, si curatarea de dupa ──────────────────────────────────────── */

const R_PE_A: Regula[] = [
  { id: "r1", cand: { c: "completat", nod: "a" }, atunci: [{ a: "ascunde", tinta: "b" }] },
  { id: "r2", cand: { c: "completat", nod: "b" }, atunci: [{ a: "ascunde", tinta: "a" }] },
  { id: "r3", cand: { c: "completat", nod: "b" }, atunci: [{ a: "ascunde", tinta: "b" }] },
];

test("STERGEREA UNUI NOD CURATA SI REGULILE care trimiteau la el", () => {
  /*
   * O regula al carei declansator a disparut nu se mai aprinde niciodata; una a carei tinta a
   * disparut nu mai schimba nimic. Amandoua ar fi ramas in panou ca reguli care „exista si nu
   * fac nimic", si ar fi picat validarea cu un mesaj despre ceva ce comerciantul nu mai vede.
   */
  const { c } = schela();
  const dupa = stergeNod({ ...c, reguli: R_PE_A }, "a");
  assert.deepEqual(dupa.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["b"]);
  // r1 citeste `a` -> se scoate. r2 tinteste `a` -> ramane fara actiuni -> se scoate. r3 e curata.
  assert.deepEqual(dupa.reguli.map((r) => r.id), ["r3"]);
});

test("stergerea unui GRUP curata dupa toate nodurile din el", () => {
  const { c, idGrup } = schela();
  const dupa = stergeGrup({ ...c, reguli: R_PE_A }, idGrup);
  assert.equal(dupa.definitie.pasi[0].grupuri.length, 0);
  assert.deepEqual(dupa.reguli, [], "toate regulile trimiteau la nodurile din grup");
});

test("stergerea unui PAS ia cu ea grupurile si nodurile lui", () => {
  const { c, idPas } = schela();
  const dupa = stergePas({ ...c, reguli: R_PE_A }, idPas);
  assert.equal(dupa.definitie.pasi.length, 0);
  assert.deepEqual(dupa.reguli, []);
});

test("o regula care tinteste un GRUP sters se scoate si ea", () => {
  const { c, idGrup } = schela();
  const reguli: Regula[] = [
    { id: "r", cand: { c: "completat", nod: "a" }, atunci: [{ a: "ascunde", tinta: idGrup }] },
  ];
  const dupa = stergeGrup({ ...c, reguli }, idGrup);
  assert.deepEqual(dupa.reguli, []);
});

test("regulile care nu ating nimic sters raman neatinse", () => {
  const { c } = schela();
  const reguli: Regula[] = [
    { id: "r", cand: { c: "completat", nod: "b" }, atunci: [{ a: "ascunde", tinta: "b" }] },
  ];
  const dupa = stergeNod({ ...c, reguli }, "a");
  assert.deepEqual(dupa.reguli, reguli);
});

test("faraReferintaLa pastreaza actiunile bune ale unei reguli", () => {
  const reguli: Regula[] = [
    { id: "r", cand: { c: "completat", nod: "x" }, atunci: [{ a: "ascunde", tinta: "sters" }, { a: "ascunde", tinta: "ramas" }] },
  ];
  const dupa = faraReferintaLa(reguli, new Set(["sters"]));
  assert.equal(dupa.length, 1);
  assert.deepEqual(dupa[0].atunci, [{ a: "ascunde", tinta: "ramas" }]);
});

/* ── Mutare ──────────────────────────────────────────────────────────────── */

test("mutarea sus si jos, cu butoane — nu doar cu mausul", () => {
  /*
   * Tragerea e greu de folosit pe telefon si imposibila cu tastatura. Butoanele nu sunt o
   * rezerva de politete: pentru o parte dintre oameni sunt singurul drum.
   */
  const { c } = schela();
  const jos = mutaNod(c, "a", 1);
  assert.deepEqual(jos.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["b", "a"]);
  const inapoi = mutaNod(jos, "a", -1);
  assert.deepEqual(inapoi.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["a", "b"]);
});

test("la CAPAT nu se intampla nimic: lista nu se roteste", () => {
  const { c } = schela();
  assert.equal(mutaNod(c, "a", -1), c, "primul, mutat in sus, ramane pe loc");
  assert.equal(mutaNod(c, "b", 1), c, "ultimul, mutat in jos, ramane pe loc");
  assert.equal(mutaNod(c, "inexistent", 1), c);
});

test("pasii si grupurile se muta la fel", () => {
  let c = adaugaPas(GOL, "Unu");
  c = adaugaPas(c, "Doi");
  const [p1, p2] = c.definitie.pasi.map((p) => p.id);
  assert.deepEqual(mutaPas(c, p1, 1).definitie.pasi.map((p) => p.id), [p2, p1]);

  const cuGrupuri = adaugaGrup(c, p1, "Al doilea grup");
  const [g1, g2] = cuGrupuri.definitie.pasi[0].grupuri.map((g) => g.id);
  assert.deepEqual(mutaGrup(cuGrupuri, g1, 1).definitie.pasi[0].grupuri.map((g) => g.id), [g2, g1]);
});

test("grupul se muta INAUNTRUL pasului lui, nu intre pasi", () => {
  let c = adaugaPas(GOL, "Unu");
  c = adaugaPas(c, "Doi");
  const gDinPrimul = c.definitie.pasi[0].grupuri[0].id;
  // Singur in pasul lui: mutat in jos, nu pleaca in al doilea pas.
  const dupa = mutaGrup(c, gDinPrimul, 1);
  assert.equal(dupa.definitie.pasi[0].grupuri.length, 1);
  assert.equal(dupa.definitie.pasi[1].grupuri.length, 1);
});

/* ── Optiuni ─────────────────────────────────────────────────────────────── */

const alegere: Nod = {
  fel: "alegere", control: "lista", id: "mat", eticheta: "Material",
  optiuni: [{ id: "a", eticheta: "A" }, { id: "b", eticheta: "B" }],
  implicit: "a",
};

test("optiunile se adauga, se muta si se sterg", () => {
  const cuTrei = adaugaOptiune(alegere, "C");
  assert.equal(cuTrei.fel === "alegere" && cuTrei.optiuni.length, 3);
  const mutata = mutaOptiune(alegere, "a", 1);
  assert.deepEqual(mutata.fel === "alegere" ? mutata.optiuni.map((o) => o.id) : [], ["b", "a"]);
});

test("stergerea optiunii care era IMPLICIT scoate si implicitul", () => {
  /*
   * Lasat, ar fi aratat spre ceva inexistent, iar validatorul l-ar fi refuzat la publicare cu un
   * mesaj despre o optiune pe care comerciantul tocmai a sters-o.
   */
  const dupa = stergeOptiune(alegere, "a");
  assert.ok(dupa.fel === "alegere");
  assert.deepEqual(dupa.optiuni.map((o) => o.id), ["b"]);
  assert.equal(dupa.implicit, undefined);
});

test("stergerea altei optiuni lasa implicitul in pace", () => {
  const dupa = stergeOptiune(alegere, "b");
  assert.ok(dupa.fel === "alegere");
  assert.equal(dupa.implicit, "a");
});

test("un nod care nu are optiuni ramane neatins", () => {
  const t = text("x");
  assert.equal(adaugaOptiune(t), t);
  assert.equal(stergeOptiune(t, "a"), t);
  assert.equal(mutaOptiune(t, "a", 1), t);
});
