import test from "node:test";
import assert from "node:assert/strict";
import {
  aplicaRegulile, seAprinde, esteAscuns, esteCerut, optiuniDeAles, nodurileCerute,
  MAX_TRECERI, type Conditie, type Regula, type Stare,
} from "./reguli";
import { nodDupaId, type Definitie, type Nod } from "./definitie";
import { normalizeazaValori, type Valori } from "./valori";

/* ── Schele ──────────────────────────────────────────────────────────────── */

const alegere = (id: string, optiuni: string[], extra: Partial<Nod> = {}): Nod => ({
  fel: "alegere", control: "lista", id, eticheta: id,
  optiuni: optiuni.map((o) => ({ id: o, eticheta: o })),
  ...extra,
} as Nod);

const text = (id: string, extra: Partial<Nod> = {}): Nod =>
  ({ fel: "text", control: "scurt", id, eticheta: id, ...extra } as Nod);

const numar = (id: string, extra: Partial<Nod> = {}): Nod =>
  ({ fel: "numar", control: "camp", id, eticheta: id, ...extra } as Nod);

function def(noduri: Nod[], grupId = "g1", pasId = "p1"): Definitie {
  return {
    versiuneSchema: 1, mod: "auto",
    pasi: [{ id: pasId, eticheta: "Pas", grupuri: [{ id: grupId, noduri }] }],
  };
}

/** Doua grupuri in acelasi pas, cand declansatorul trebuie sa stea in AFARA celui ascuns. */
function defDouaGrupuri(a: Nod[], b: Nod[]): Definitie {
  return {
    versiuneSchema: 1, mod: "auto",
    pasi: [{ id: "p1", eticheta: "Pas", grupuri: [{ id: "gA", noduri: a }, { id: "gB", noduri: b }] }],
  };
}

const v = (o: Record<string, unknown>): Valori => normalizeazaValori(o);
const alesA = (id: string, val: string) => ({ [id]: { f: "alegere", v: val } });

/* ── Conditii ────────────────────────────────────────────────────────────── */

test("conditiile de baza", () => {
  const val = v({ ...alesA("mat", "premium"), t: { f: "text", v: "Ana" }, n: { f: "numar", v: 50 } });
  assert.equal(seAprinde({ c: "este", nod: "mat", v: "premium" }, val), true);
  assert.equal(seAprinde({ c: "este", nod: "mat", v: "standard" }, val), false);
  assert.equal(seAprinde({ c: "nu_este", nod: "mat", v: "standard" }, val), true);
  assert.equal(seAprinde({ c: "una_din", nod: "mat", v: ["premium", "lux"] }, val), true);
  assert.equal(seAprinde({ c: "niciuna_din", nod: "mat", v: ["lux"] }, val), true);
  assert.equal(seAprinde({ c: "completat", nod: "t" }, val), true);
  assert.equal(seAprinde({ c: "necompletat", nod: "lipsa" }, val), true);
  assert.equal(seAprinde({ c: "cmp", nod: "n", op: ">", v: 40 }, val), true);
  assert.equal(seAprinde({ c: "cmp", nod: "n", op: ">", v: 50 }, val), false);
  assert.equal(seAprinde({ c: "intre", nod: "n", min: 10, max: 100 }, val), true);
  assert.equal(seAprinde({ c: "nu_intre", nod: "n", min: 10, max: 100 }, val), false);
  assert.equal(seAprinde({ c: "contine", nod: "t", v: "n" }, val), true);
  assert.equal(seAprinde({ c: "incepe_cu", nod: "t", v: "A" }, val), true);
  assert.equal(seAprinde({ c: "termina_cu", nod: "t", v: "a" }, val), true);
});

test("SI si SAU", () => {
  const val = v({ ...alesA("a", "x"), ...alesA("b", "y") });
  assert.equal(seAprinde({ c: "si", din: [{ c: "este", nod: "a", v: "x" }, { c: "este", nod: "b", v: "y" }] }, val), true);
  assert.equal(seAprinde({ c: "si", din: [{ c: "este", nod: "a", v: "x" }, { c: "este", nod: "b", v: "z" }] }, val), false);
  assert.equal(seAprinde({ c: "sau", din: [{ c: "este", nod: "a", v: "z" }, { c: "este", nod: "b", v: "y" }] }, val), true);
  // A SI (B SAU C)
  assert.equal(seAprinde({
    c: "si", din: [{ c: "este", nod: "a", v: "x" },
      { c: "sau", din: [{ c: "este", nod: "b", v: "z" }, { c: "este", nod: "b", v: "y" }] }],
  }, val), true);
});

test("lipsa de date da MEREU fals, niciodata adevarat", () => {
  /*
   * O regula care ascunde ceva „fiindca nu stim" ar fi ascuns campuri la intamplare pe o
   * definitie in lucru. Si `nu_intre` fara valoare nu inseamna „in afara intervalului".
   */
  const gol = v({});
  assert.equal(seAprinde({ c: "este", nod: "lipsa", v: "x" }, gol), false);
  assert.equal(seAprinde({ c: "cmp", nod: "lipsa", op: ">", v: 0 }, gol), false);
  assert.equal(seAprinde({ c: "nu_intre", nod: "lipsa", min: 1, max: 2 }, gol), false);
  assert.equal(seAprinde({ c: "contine", nod: "lipsa", v: "" }, gol), false);
  // Un fel de conditie mai nou decat codul nu se ghiceste.
  assert.equal(seAprinde({ c: "de-maine", nod: "x" } as never, gol), false);
});

test("nodurileCerute strange tot ce citeste conditia", () => {
  const c: Conditie = { c: "si", din: [{ c: "este", nod: "a", v: "x" }, { c: "cmp", nod: "b", op: ">", v: 1 }] };
  assert.deepEqual([...nodurileCerute(c)].sort(), ["a", "b"]);
});

/* ── Arata / ascunde, si valorile fantoma ────────────────────────────────── */

const D_MATERIAL = def([
  alegere("mat", ["standard", "premium"]),
  alegere("finisaj", ["mat", "lucios"]),
]);

const R_FINISAJ: Regula[] = [
  { id: "r1", cand: { c: "nu_este", nod: "mat", v: "premium" }, atunci: [{ a: "ascunde", tinta: "finisaj" }] },
];

test("campul ascuns isi PIERDE valoarea", () => {
  /*
   * Cerinta din plan: o valoare ramasa in urma unui camp pe care cumparatorul nu-l mai vede ar
   * fi intrat in amprenta, in pret si in comanda, ca o alegere pe care n-a facut-o nimeni.
   */
  const s = aplicaRegulile(D_MATERIAL, R_FINISAJ, v({ ...alesA("mat", "standard"), ...alesA("finisaj", "lucios") }));
  assert.equal(esteAscuns(D_MATERIAL, s, "finisaj"), true);
  assert.equal(s.valori.finisaj, undefined, "valoarea fantoma trebuie sa dispara");
  assert.equal(s.valori.mat !== undefined, true, "campul vizibil ramane neatins");
});

test("campul redevenit vizibil ramane GOL, nu-si recapata valoarea veche", () => {
  const s = aplicaRegulile(D_MATERIAL, R_FINISAJ, v({ ...alesA("mat", "premium"), ...alesA("finisaj", "lucios") }));
  assert.equal(esteAscuns(D_MATERIAL, s, "finisaj"), false);
  assert.equal((s.valori.finisaj as { v: string }).v, "lucios");
});

test("ascunderea unui GRUP ascunde si campurile din el", () => {
  // ⚠ Declansatorul sta in ALT grup — vezi proba urmatoare pentru ce se intampla altfel.
  const d = defDouaGrupuri([alegere("mat", ["a", "b"])], [text("gravura")]);
  const s = aplicaRegulile(d, [
    { id: "r", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "gB" }] },
  ], v({ ...alesA("mat", "a"), gravura: { f: "text", v: "Ana" } }));
  assert.equal(esteAscuns(d, s, "gravura"), true, "nodul dintr-un grup ascuns e si el ascuns");
  assert.equal(s.valori.gravura, undefined);
  assert.equal(s.valori.mat !== undefined, true, "declansatorul, din alt grup, ramane");
});

test("un grup care se ascunde PE SINE se aseaza pe vizibil, nu oscileaza la nesfarsit", () => {
  /*
   * Comerciantul poate scrie o regula al carei declansator sta chiar in grupul ascuns. Atunci
   * ascunderea isi taie propria conditie: valoarea se goleste, regula nu se mai aprinde, grupul
   * reapare — si asa mai departe.
   *
   * Punctul fix exista totusi, si cade pe partea SIGURA: grupul ramane vizibil, cu campurile
   * goale. Un grup aratat din greseala se completeaza; unul ascuns care pastreaza o valoare
   * fantoma ar fi trimis in comanda o alegere pe care n-a facut-o nimeni.
   */
  const d = def([alegere("mat", ["a", "b"]), text("gravura")], "gEx");
  const s = aplicaRegulile(d, [
    { id: "r", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "gEx" }] },
  ], v({ ...alesA("mat", "a"), gravura: { f: "text", v: "Ana" } }));
  assert.equal(esteAscuns(d, s, "gravura"), false, "se aseaza pe vizibil");
  assert.equal(s.valori.gravura, undefined, "dar valorile fantoma tot au disparut");
  assert.equal(s.valori.mat, undefined);
  assert.equal(s.neasezat, false, "e o stare STABILA, nu o oscilatie");
});

/* ── Punctul fix ─────────────────────────────────────────────────────────── */

test("REGULILE SE INTORC UNA PESTE ALTA: se atinge punctul fix", () => {
  /*
   * `b` se vede doar cand `a` e „da". `c` se vede doar cand `b` e completat. Se porneste cu
   * toate trei completate si cu `a` pe „nu": trebuie sa cada AMANDOUA, in lant, nu doar `b`.
   */
  const d = def([alegere("a", ["da", "nu"]), text("b"), text("c")]);
  const reguli: Regula[] = [
    { id: "r1", cand: { c: "nu_este", nod: "a", v: "da" }, atunci: [{ a: "ascunde", tinta: "b" }] },
    { id: "r2", cand: { c: "necompletat", nod: "b" }, atunci: [{ a: "ascunde", tinta: "c" }] },
  ];
  const s = aplicaRegulile(d, reguli, v({
    ...alesA("a", "nu"), b: { f: "text", v: "x" }, c: { f: "text", v: "y" },
  }));
  assert.equal(s.valori.b, undefined, "b cade fiindca a nu e da");
  assert.equal(s.valori.c, undefined, "c cade fiindca b a ramas gol — al doilea val");
  assert.equal(s.neasezat, false);
});

test("o definitie care OSCILEAZA se spune pe fata, nu se arunca", () => {
  /*
   * `x` ascunde `y` cand `y` e completat, iar `pune` il completeaza la loc. Nu exista stare
   * stabila. Cumparatorul trebuie sa vada totusi ceva coerent.
   */
  const d = def([text("y")]);
  const reguli: Regula[] = [
    { id: "r1", cand: { c: "necompletat", nod: "y" }, atunci: [{ a: "pune", tinta: "y", v: { f: "text", v: "z" } }] },
    { id: "r2", cand: { c: "completat", nod: "y" }, atunci: [{ a: "ascunde", tinta: "y" }] },
  ];
  const s = aplicaRegulile(d, reguli, v({}));
  assert.equal(s.neasezat, true, "oscilatia trebuie raportata");
  assert.ok(s.valori !== undefined, "starea nu se arunca");
});

test("o definitie linistita NU se raporteaza ca oscilanta", () => {
  const s = aplicaRegulile(D_MATERIAL, R_FINISAJ, v(alesA("mat", "premium")));
  assert.equal(s.neasezat, false);
});

/* ── Conflicte ───────────────────────────────────────────────────────────── */

test("CONFLICT: ascunde bate arata, si se raporteaza", () => {
  /*
   * Cerinta din plan: niciodata „ultima regula din lista castiga". Aici cele doua reguli se
   * aprind amandoua; rezultatul nu are voie sa depinda de ordinea lor.
   */
  const d = def([alegere("a", ["x"]), text("t")]);
  const doua: Regula[] = [
    { id: "r1", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "arata", tinta: "t" }] },
    { id: "r2", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "ascunde", tinta: "t" }] },
  ];
  const s1 = aplicaRegulile(d, doua, v(alesA("a", "x")));
  const s2 = aplicaRegulile(d, [doua[1], doua[0]], v(alesA("a", "x")));
  assert.equal(esteAscuns(d, s1, "t"), true, "cea mai stransa castiga");
  assert.equal(esteAscuns(d, s2, "t"), true, "si nu depinde de ordine");
  assert.equal(s1.conflicte.length, 1);
  assert.equal(s1.conflicte[0].fel, "vizibilitate");
  assert.equal(s1.conflicte[0].castigator, "ascunde");
});

test("CONFLICT: obligatoriu bate optional", () => {
  const d = def([alegere("a", ["x"]), text("t")]);
  const s = aplicaRegulile(d, [
    { id: "r1", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "optional", tinta: "t" }] },
    { id: "r2", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "obligatoriu", tinta: "t" }] },
  ], v(alesA("a", "x")));
  assert.equal(esteCerut(d, nodDupaId(d, "t")!, s), true);
  assert.equal(s.conflicte.some((c) => c.fel === "obligativitate"), true);
});

/* ── Obligatoriu, si de ce ascunsul nu blocheaza ─────────────────────────── */

test("CAMPUL ASCUNS NU BLOCHEAZA, oricat ar fi de obligatoriu", () => {
  const d = def([alegere("mat", ["standard", "premium"]), text("finisaj", { obligatoriu: true })]);
  const s = aplicaRegulile(d, R_FINISAJ, v(alesA("mat", "standard")));
  assert.equal(esteAscuns(d, s, "finisaj"), true);
  assert.equal(esteCerut(d, nodDupaId(d, "finisaj")!, s), false,
    "altfel magazinul s-ar inchide singur dintr-o regula scrisa gresit");
});

test("campul DEZACTIVAT nu blocheaza nici el", () => {
  const d = def([alegere("a", ["x"]), text("t", { obligatoriu: true })]);
  const s = aplicaRegulile(d, [
    { id: "r", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "dezactiveaza", tinta: "t" }] },
  ], v(alesA("a", "x")));
  assert.equal(esteCerut(d, nodDupaId(d, "t")!, s), false);
});

test("o regula poate face obligatoriu un camp care nu era", () => {
  const d = def([alegere("a", ["x", "y"]), text("t")]);
  const s = aplicaRegulile(d, [
    { id: "r", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "obligatoriu", tinta: "t" }] },
  ], v(alesA("a", "x")));
  assert.equal(esteCerut(d, nodDupaId(d, "t")!, s), true);
});

/* ── Ingustarea optiunilor ───────────────────────────────────────────────── */

test("doua ingustari se INTERSECTEAZA, nu se aduna", () => {
  /*
   * Reuniunea ar fi facut ca a doua regula sa LARGEASCA ce a strans prima — adica sa aduca
   * inapoi in vanzare o optiune pe care o regula tocmai o scosese.
   */
  const d = def([alegere("a", ["x"]), alegere("mat", ["A", "B", "C"])]);
  const s = aplicaRegulile(d, [
    { id: "r1", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "doar_optiunile", tinta: "mat", optiuni: ["A", "B"] }] },
    { id: "r2", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "doar_optiunile", tinta: "mat", optiuni: ["B", "C"] }] },
  ], v(alesA("a", "x")));
  assert.deepEqual(optiuniDeAles(nodDupaId(d, "mat")!, s), ["B"]);
});

test("scoaterile se ADUNA", () => {
  const d = def([alegere("a", ["x"]), alegere("mat", ["A", "B", "C"])]);
  const s = aplicaRegulile(d, [
    { id: "r1", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "fara_optiunile", tinta: "mat", optiuni: ["A"] }] },
    { id: "r2", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "fara_optiunile", tinta: "mat", optiuni: ["B"] }] },
  ], v(alesA("a", "x")));
  assert.deepEqual(optiuniDeAles(nodDupaId(d, "mat")!, s), ["C"]);
});

test("o optiune STINSA din definitie nu poate fi reaprinsa de o regula", () => {
  // Comerciantul a scos-o din vanzare; o regula care o readuce ar vinde ce nu mai exista.
  const d = def([
    alegere("a", ["x"]),
    { fel: "alegere", control: "lista", id: "mat", eticheta: "mat",
      optiuni: [{ id: "A", eticheta: "A", activa: false }, { id: "B", eticheta: "B" }] } as Nod,
  ]);
  const s = aplicaRegulile(d, [
    { id: "r", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "doar_optiunile", tinta: "mat", optiuni: ["A", "B"] }] },
  ], v(alesA("a", "x")));
  assert.deepEqual(optiuniDeAles(nodDupaId(d, "mat")!, s), ["B"]);
});

/* ── Limite, mesaje, opriri ──────────────────────────────────────────────── */

test("limitele se string, nu se largesc", () => {
  const d = def([alegere("a", ["x"]), numar("l", { min: 0, max: 1000 })]);
  const s = aplicaRegulile(d, [
    { id: "r1", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "min", tinta: "l", v: 100 }, { a: "max", tinta: "l", v: 900 }] },
    { id: "r2", cand: { c: "este", nod: "a", v: "x" }, atunci: [{ a: "min", tinta: "l", v: 200 }, { a: "max", tinta: "l", v: 800 }] },
  ], v(alesA("a", "x")));
  assert.deepEqual(s.limite.get("l"), { min: 200, max: 800 });
});

test("mesajele si opririle ajung in stare", () => {
  const d = def([alegere("a", ["x"])]);
  const s = aplicaRegulile(d, [
    { id: "r1", cand: { c: "este", nod: "a", v: "x" }, atunci: [
      { a: "mesaj", nivel: "atentie", text: "Verifica dimensiunea.", tinta: "a" },
      { a: "opreste", text: "Profilul Standard nu se face peste 300 cm." },
    ] },
  ], v(alesA("a", "x")));
  assert.equal(s.mesaje.length, 1);
  assert.equal(s.mesaje[0].nivel, "atentie");
  assert.deepEqual(s.opriri, ["Profilul Standard nu se face peste 300 cm."]);
});

test("o regula STINSA nu se aplica", () => {
  const s = aplicaRegulile(D_MATERIAL, [{ ...R_FINISAJ[0], activa: false }], v(alesA("mat", "standard")));
  assert.equal(esteAscuns(D_MATERIAL, s, "finisaj"), false);
});

test("fara reguli, nimic nu se schimba", () => {
  const intrare = v({ ...alesA("mat", "premium"), ...alesA("finisaj", "mat") });
  const s: Stare = aplicaRegulile(D_MATERIAL, [], intrare);
  assert.deepEqual(s.valori, intrare);
  assert.equal(s.conflicte.length, 0);
  assert.equal(s.neasezat, false);
  assert.equal(s.opriri.length, 0);
});

test("plafonul de treceri exista si e mai mare decat un lant obisnuit", () => {
  assert.ok(MAX_TRECERI >= 8, "un lant de cateva reguli trebuie sa incapa fara sa para oscilatie");
});
