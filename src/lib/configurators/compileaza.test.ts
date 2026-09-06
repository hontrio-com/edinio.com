import test from "node:test";
import assert from "node:assert/strict";
import { compileaza, citesteCompilat, VERSIUNE_COMPILAT } from "./compileaza";
import type { Definitie, Nod } from "./definitie";
import type { Regula } from "./reguli";
import type { Pretuire } from "./pret";

const nodAlegere: Nod = {
  fel: "alegere", control: "lista", id: "mat", eticheta: "Material",
  optiuni: [
    { id: "a", eticheta: "Standard", pret: 0, componenta: { id: "c1", bucati: 2 } },
    { id: "b", eticheta: "Premium", pret: 40, grame: 500, culoare: "#fff", activa: false },
  ],
};

const D: Definitie = {
  versiuneSchema: 1, mod: "auto",
  pasi: [{ id: "p1", eticheta: "Pas", grupuri: [{ id: "g1", noduri: [nodAlegere] }] }],
};

const P: Pretuire = { baza: "produs", minim: 10 };

test("ce trebuie sa ajunga la cumparator, ajunge", () => {
  const c = compileaza(D, [], P);
  assert.equal(c.v, VERSIUNE_COMPILAT);
  const o = c.definitie.pasi[0].grupuri[0].noduri[0];
  assert.ok(o.fel === "alegere");
  assert.equal(o.optiuni.length, 2);
  assert.equal(o.optiuni[1].pret, 40, "pretul optiunii se vede: din el se face pretul de pe ecran");
  assert.equal(o.optiuni[1].grame, 500, "greutatea se vede: din ea se face transportul");
  assert.equal(o.optiuni[1].culoare, "#fff");
  assert.equal(o.optiuni[1].activa, false, "optiunea stinsa ramane, ca sa se poata arata inactiva");
  assert.deepEqual(c.pretuire, P);
});

test("cate BUCATI consuma o alegere se vede; cat ne costa pe noi, NU", () => {
  /*
   * Vitrina trebuie sa poata arata „mai sunt 3 in stoc", deci are nevoie de numarul de bucati.
   * Pretul de achizitie al componentei e insa date de afacere ale comerciantului, si n-are ce
   * cauta in sursa unei pagini publice.
   */
  const c = compileaza(D, [], P);
  const o = c.definitie.pasi[0].grupuri[0].noduri[0];
  assert.ok(o.fel === "alegere");
  assert.deepEqual(o.optiuni[0].componenta, { id: "c1", bucati: 2 });
  assert.deepEqual(Object.keys(o.optiuni[0].componenta!).sort(), ["bucati", "id"],
    "nimic in plus pe componenta");
});

test("regulile STINSE nu pleaca la cumparator", () => {
  /*
   * N-ar face nimic — motorul le sare oricum — dar i-ar arata oricui deschide sursa paginii ce a
   * incercat comerciantul si a renuntat. Si sunt octeti platiti la fiecare cerere.
   */
  const reguli: Regula[] = [
    { id: "vie", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "g1" }] },
    { id: "stinsa", activa: false, cand: { c: "este", nod: "mat", v: "b" }, atunci: [{ a: "ascunde", tinta: "g1" }] },
  ];
  const c = compileaza(D, reguli, P);
  assert.deepEqual(c.reguli.map((r) => r.id), ["vie"]);
});

test("compilarea nu ATINGE definitia primita", () => {
  // Modificata pe loc, ciorna comerciantului s-ar fi schimbat sub el la fiecare publicare.
  const inainte = JSON.stringify(D);
  compileaza(D, [], P);
  assert.equal(JSON.stringify(D), inainte);
});

test("acelasi continut da acelasi compilat, de fiecare data", () => {
  // Versiunea publicata e imutabila, deci si ce iese de aici trebuie sa fie.
  const intai = JSON.stringify(compileaza(D, [], P));
  for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(compileaza(D, [], P)), intai);
});

/* ── Citirea inapoi ──────────────────────────────────────────────────────── */

test("dus si intors prin JSON, ca prin baza", () => {
  const c = compileaza(D, [], P);
  const inapoi = citesteCompilat(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(inapoi, c);
});

test("o forma NECUNOSCUTA se refuza, nu se serveste pe jumatate", () => {
  /*
   * O versiune compilata de un cod mai nou decat cel care o citeste nu se poate intelege
   * partial. Mai bine produsul se arata fara configurator si cineva vede ca ceva nu e in regula,
   * decat sa se vanda dupa reguli intelese pe jumatate.
   */
  assert.equal(citesteCompilat({ v: 99, definitie: {} }), null);
  assert.equal(citesteCompilat({ definitie: {} }), null, "fara versiune");
  assert.equal(citesteCompilat({ v: VERSIUNE_COMPILAT }), null, "fara definitie");
  assert.equal(citesteCompilat(null), null);
  assert.equal(citesteCompilat("sir"), null);
});

test("regulile si pretuirea lipsa cad pe gol, nu pe undefined", () => {
  const c = citesteCompilat({ v: VERSIUNE_COMPILAT, definitie: { pasi: [] } });
  assert.ok(c);
  assert.deepEqual(c.reguli, []);
  assert.deepEqual(c.pretuire, {});
});

test("⚠ previzualizarea AJUNGE la vitrina", () => {
  /*
   * ⚠ `nodPentruVitrina` atinge doar nodurile cu optiuni si le lasa pe celelalte intregi, deci
   * previzualizarea trece azi din intamplare fericita, nu fiindca a cerut-o cineva. Cine adauga
   * vreodata o lista alba de campuri acolo — ca sa slabeasca versiunea publicata, ceea ce e un
   * lucru bun de facut — ar taia zonele fara ca nimic sa cada: pe magazin s-ar fi vazut poza
   * produsului fara nicio gravura, iar comerciantul ar fi cautat greseala in builder.
   */
  const d: Definitie = {
    versiuneSchema: 1, mod: "auto",
    pasi: [{ id: "p1", eticheta: "P", grupuri: [{ id: "g1", noduri: [
      { fel: "text", control: "scurt", id: "grav", eticheta: "Gravura" },
      { fel: "afisaj", control: "previzualizare", id: "prv", eticheta: "Cum arata",
        previzualizare: { imagine: "/cana.jpg", zone: [{ nod: "grav", x: 0.2, y: 0.3, l: 0.5, i: 0.2 }] } },
    ] }] }],
  };
  const c = compileaza(d, [], { baza: "produs" });
  const prv = c.definitie.pasi[0].grupuri[0].noduri[1] as Nod & { fel: "afisaj" };
  assert.equal(prv.previzualizare?.imagine, "/cana.jpg");
  assert.equal(prv.previzualizare?.zone.length, 1);
  assert.equal(prv.previzualizare?.zone[0].nod, "grav");
});
