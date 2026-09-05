import test from "node:test";
import assert from "node:assert/strict";
import { valideaza, configuratiaImplicita, ciclurileDintreCalcule, type IntrareValidare } from "./validare";
import type { Definitie, Nod } from "./definitie";
import type { Regula } from "./reguli";
import type { Pretuire } from "./pret";
import { bin, num, ref, type Expresie } from "./expresii";

/* ── Schele ──────────────────────────────────────────────────────────────── */

function def(noduri: Nod[], calcule?: Record<string, Expresie>, pasi2?: Nod[]): Definitie {
  const p = [{ id: "p1", eticheta: "Pas", grupuri: [{ id: "g1", noduri }] }];
  if (pasi2) p.push({ id: "p2", eticheta: "Pas doi", grupuri: [{ id: "g2", noduri: pasi2 }] });
  return { versiuneSchema: 1, mod: "auto", pasi: p, ...(calcule ? { calcule } : {}) };
}

const alegere = (id: string, optiuni: { id: string; eticheta: string; pret?: number; activa?: boolean }[]): Nod =>
  ({ fel: "alegere", control: "lista", id, eticheta: id, optiuni } as Nod);

const numar = (id: string, extra: Record<string, unknown> = {}): Nod =>
  ({ fel: "numar", control: "camp", id, eticheta: id, ...extra } as Nod);

function val(over: Partial<IntrareValidare> = {}) {
  const baza: IntrareValidare = {
    definitie: def([alegere("mat", [{ id: "a", eticheta: "A" }])]),
    reguli: [], pretuire: { baza: "produs" }, pretProdus: 100,
  };
  return valideaza({ ...baza, ...over });
}

const coduri = (r: ReturnType<typeof valideaza>) => r.constatari.map((x) => x.cod);
const critice = (r: ReturnType<typeof valideaza>) =>
  r.constatari.filter((x) => x.treapta === "critic").map((x) => x.cod);

/* ── Ce trebuie sa TREACA ────────────────────────────────────────────────── */

test("un configurator simplu si intreg se publica", () => {
  const r = val();
  assert.equal(r.sePoatePublica, true, `constatari: ${coduri(r).join(", ")}`);
  assert.deepEqual(critice(r), []);
});

test("un configurator de fototapet, intreg, se publica", () => {
  const d = def(
    [numar("l", { min: 500, max: 5000, implicit: 3500 }), numar("h", { min: 500, max: 4000, implicit: 2560 })],
    { suprafata: bin("impart", bin("inmultesc", ref("l"), ref("h")), num(1_000_000)) },
  );
  const p: Pretuire = { baza: "fara", formula: bin("inmultesc", ref("suprafata"), num(89)) };
  const r = valideaza({ definitie: d, reguli: [], pretuire: p });
  assert.equal(r.sePoatePublica, true, `constatari: ${coduri(r).join(", ")}`);
});

/* ── Structura ───────────────────────────────────────────────────────────── */

test("un configurator FARA nicio optiune nu se publica", () => {
  const r = val({ definitie: def([]) });
  assert.equal(r.sePoatePublica, false);
  assert.ok(critice(r).includes("fara_optiuni"));
});

test("id-urile repetate opresc publicarea", () => {
  /*
   * Cea mai rea greseala de structura: formulele si regulile trimit la id, iar `harta` ia
   * PRIMUL — deci o regula ar lovi cine se nimereste.
   */
  const r = val({ definitie: def([alegere("mat", [{ id: "a", eticheta: "A" }]), numar("mat")]) });
  assert.ok(critice(r).includes("id_repetat"));
});

test("o alegere fara nicio optiune ACTIVA nu se publica", () => {
  const r = val({
    definitie: def([alegere("mat", [{ id: "a", eticheta: "A", activa: false }])]),
  });
  assert.ok(critice(r).includes("alegere_fara_optiuni"));
});

test("o optiune fara nume nu se publica", () => {
  const r = val({ definitie: def([alegere("mat", [{ id: "a", eticheta: "  " }])]) });
  assert.ok(critice(r).includes("optiune_fara_eticheta"));
});

test("minimul mai mare decat maximul, pe un numar", () => {
  const r = val({ definitie: def([numar("l", { min: 500, max: 100 })]) });
  assert.ok(critice(r).includes("limite_pe_dos"));
});

test("un pas GOL doar avertizeaza — se sare singur, si poate fi voit", () => {
  const r = val({
    definitie: def([alegere("mat", [{ id: "a", eticheta: "A" }])], undefined, []),
  });
  assert.ok(coduri(r).includes("pas_gol"));
  assert.equal(r.sePoatePublica, true, "un pas gol nu opreste vanzarea");
});

/* ── Formule ─────────────────────────────────────────────────────────────── */

test("o formula care trimite la ceva inexistent nu se publica", () => {
  const r = val({ pretuire: { baza: "fara", formula: ref("nu-exista") } });
  assert.ok(critice(r).includes("referinta_lipsa"));
});

test("un calcul care se cere PE SINE nu se publica", () => {
  const d = def([alegere("mat", [{ id: "a", eticheta: "A" }])], { x: bin("adun", ref("x"), num(1)) });
  const r = val({ definitie: d });
  assert.ok(critice(r).includes("ciclu_calcule"));
});

test("un ciclu LUNG intre calcule se prinde tot", () => {
  const d = def([alegere("mat", [{ id: "a", eticheta: "A" }])], { a: ref("b"), b: ref("c"), c: ref("a") });
  assert.ok(ciclurileDintreCalcule(d).length > 0);
  assert.ok(critice(val({ definitie: d })).includes("ciclu_calcule"));
});

test("un lant DREPT de calcule nu e ciclu", () => {
  const d = def([numar("l", { implicit: 10 })], {
    a: bin("inmultesc", ref("l"), num(2)),
    b: bin("adun", ref("a"), num(1)),
    c: bin("adun", ref("b"), num(1)),
  });
  assert.deepEqual(ciclurileDintreCalcule(d), []);
});

test("acelasi calcul cerut de DOUA ramuri nu e ciclu", () => {
  const d = def([numar("l", { implicit: 10 })], {
    dublu: bin("inmultesc", ref("l"), num(2)),
    suma: bin("adun", ref("dublu"), ref("dublu")),
  });
  assert.deepEqual(ciclurileDintreCalcule(d), []);
});

/* ── Reguli ──────────────────────────────────────────────────────────────── */

test("o regula care se uita la o optiune stearsa nu se publica", () => {
  const reguli: Regula[] = [
    { id: "r", cand: { c: "este", nod: "sters", v: "x" }, atunci: [{ a: "ascunde", tinta: "mat" }] },
  ];
  assert.ok(critice(val({ reguli })).includes("regula_conditie_lipsa"));
});

test("o regula care schimba ceva sters nu se publica", () => {
  const reguli: Regula[] = [
    { id: "r", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "sters" }] },
  ];
  assert.ok(critice(val({ reguli })).includes("regula_tinta_lipsa"));
});

test("o regula poate tinti un GRUP sau un PAS, nu doar un camp", () => {
  const reguli: Regula[] = [
    { id: "r1", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "g1" }] },
    { id: "r2", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "p1" }] },
  ];
  assert.ok(!critice(val({ reguli })).includes("regula_tinta_lipsa"));
});

test("o regula care ingusteaza catre o optiune inexistenta nu se publica", () => {
  const reguli: Regula[] = [
    { id: "r", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "doar_optiunile", tinta: "mat", optiuni: ["zzz"] }] },
  ];
  assert.ok(critice(val({ reguli })).includes("regula_optiune_lipsa"));
});

test("REGULI CARE OSCILEAZA: prinse rezultand chiar motorul, nu ghicind static", () => {
  /*
   * Verificarea nu e „regulile A si B se trimit una la alta, deci s-ar putea invarti". Se
   * compune configuratia implicita si se da pe ea CHIAR motorul de reguli; ce iese e ce s-ar fi
   * intamplat cu adevarat.
   */
  const d = def([{ fel: "text", control: "scurt", id: "y", eticheta: "Y" } as Nod]);
  const reguli: Regula[] = [
    { id: "r1", cand: { c: "necompletat", nod: "y" }, atunci: [{ a: "pune", tinta: "y", v: { f: "text", v: "z" } }] },
    { id: "r2", cand: { c: "completat", nod: "y" }, atunci: [{ a: "ascunde", tinta: "y" }] },
  ];
  const r = val({ definitie: d, reguli });
  assert.equal(r.sePoatePublica, false);
  assert.ok(critice(r).includes("reguli_oscileaza"));
});

test("un conflict de reguli AVERTIZEAZA, dar nu opreste", () => {
  /*
   * ⚠ Tinta conflictului trebuie sa fie ALTA decat declansatorul. Cand cele doua se suprapun,
   * ascunderea isi taie propria conditie, regulile nu se mai aprind, si conflictul dispare la
   * punctul fix — pe drept: in starea asezata chiar nu mai exista niciun conflict.
   */
  const d = def([
    alegere("mat", [{ id: "a", eticheta: "A" }]),
    alegere("finisaj", [{ id: "m", eticheta: "Mat" }]),
  ]);
  d.pasi[0].grupuri[0].noduri[0] = { ...d.pasi[0].grupuri[0].noduri[0], implicit: "a" } as Nod;
  const reguli: Regula[] = [
    { id: "r1", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "arata", tinta: "finisaj" }] },
    { id: "r2", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "finisaj" }] },
  ];
  const r = valideaza({ definitie: d, reguli, pretuire: { baza: "produs" }, pretProdus: 100 });
  assert.ok(coduri(r).includes("conflict_reguli"), `constatari: ${coduri(r).join(", ")}`);
  assert.equal(r.sePoatePublica, true, "comerciantul vede si hotaraste");
});

test("un conflict care se STINGE singur nu se mai raporteaza", () => {
  // Aceleasi doua reguli, dar tintind chiar declansatorul: la punctul fix nu mai exista conflict.
  const d = def([alegere("mat", [{ id: "a", eticheta: "A" }])]);
  d.pasi[0].grupuri[0].noduri[0] = { ...d.pasi[0].grupuri[0].noduri[0], implicit: "a" } as Nod;
  const reguli: Regula[] = [
    { id: "r1", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "arata", tinta: "mat" }] },
    { id: "r2", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "mat" }] },
  ];
  const r = valideaza({ definitie: d, reguli, pretuire: { baza: "produs" }, pretProdus: 100 });
  assert.ok(!coduri(r).includes("conflict_reguli"));
  assert.equal(r.sePoatePublica, true);
});

/* ── Pretul, pe configuratia implicita ───────────────────────────────────── */

test("un pret care iese NEGATIV pe implicit nu se publica", () => {
  const r = val({ pretuire: { baza: "produs", modificatori: [{ id: "m", fel: "fix", valoare: -500 }] } });
  assert.ok(critice(r).includes("pret_pret_negativ"));
});

test("o formula de pret care imparte la zero nu se publica", () => {
  const r = val({ pretuire: { baza: "fara", formula: bin("impart", num(1), num(0)) } });
  assert.ok(critice(r).includes("pret_impartire_la_zero"));
});

test("pretul minim mai mare decat cel maxim nu se publica", () => {
  const r = val({ pretuire: { baza: "produs", minim: 500, maxim: 100 } });
  assert.ok(critice(r).includes("limite_pret_pe_dos"));
});

/* ── Configuratia implicita ──────────────────────────────────────────────── */

test("implicitul se compune din ce a pus comerciantul", () => {
  const d = def([
    alegere("mat", [{ id: "a", eticheta: "A" }, { id: "b", eticheta: "B" }]),
    numar("l", { implicit: 3500 }),
    { fel: "comutator", control: "comutator", id: "cadou", eticheta: "Cadou", implicit: true } as Nod,
  ]);
  d.pasi[0].grupuri[0].noduri[0] = { ...d.pasi[0].grupuri[0].noduri[0], implicit: "b" } as Nod;
  const i = configuratiaImplicita(d);
  assert.deepEqual(i.mat, { f: "alegere", v: "b" });
  assert.deepEqual(i.l, { f: "numar", v: 3500 });
  assert.deepEqual(i.cadou, { f: "comutator", v: true });
});

test("un implicit STINS nu se alege", () => {
  /*
   * Comerciantul a scos optiunea din vanzare. Pusa ca implicit, primul cumparator ar fi comandat
   * ce nu mai exista.
   */
  const d = def([alegere("mat", [{ id: "a", eticheta: "A", activa: false }, { id: "b", eticheta: "B" }])]);
  d.pasi[0].grupuri[0].noduri[0] = { ...d.pasi[0].grupuri[0].noduri[0], implicit: "a" } as Nod;
  assert.equal(configuratiaImplicita(d).mat, undefined);
});

/* ── Semnele de sablon ───────────────────────────────────────────────────── */

test("valorile de DEMONSTRATIE ale sablonului opresc publicarea", () => {
  /*
   * Un sablon porneste cu „89 lei/m²" ca sa se vada cum arata. Publicat asa, primul cumparator
   * plateste un numar pe care comerciantul nu l-a ales niciodata.
   */
  const r = val({ marcajeDemo: ["Pret pe metru patrat"] });
  assert.equal(r.sePoatePublica, false);
  assert.ok(critice(r).includes("valoare_demo"));
});

test("fara semne de sablon, nimic nu se plange", () => {
  assert.ok(!coduri(val({ marcajeDemo: [] })).includes("valoare_demo"));
});

/* ── Forma raspunsului ───────────────────────────────────────────────────── */

test("fiecare constatare stie unde sa duca interfata", () => {
  const r = val({ definitie: def([alegere("mat", [{ id: "a", eticheta: "  " }])]) });
  const c = r.constatari.find((x) => x.cod === "optiune_fara_eticheta");
  assert.ok(c);
  assert.equal(c.tinta, "mat", "apasarea pe constatare trebuie sa deschida chiar optiunea");
  assert.ok(c.mesaj.length > 10, "mesajul spune ce e de reparat, nu un cod");
});

test("`atentie` singura NU opreste publicarea", () => {
  const r = val({ definitie: def([alegere("mat", [{ id: "a", eticheta: "A" }])], undefined, []) });
  assert.ok(r.constatari.some((x) => x.treapta === "atentie"));
  assert.equal(r.sePoatePublica, true);
});
