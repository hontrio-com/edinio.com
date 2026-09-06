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

const alegere = (
  id: string,
  optiuni: { id: string; eticheta: string; pret?: number; grame?: number; activa?: boolean }[],
): Nod => ({ fel: "alegere", control: "lista", id, eticheta: id, optiuni } as Nod);

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

test("un pret care nu e numar nu se publica", () => {
  const r = val({
    definitie: def([alegere("mat", [{ id: "a", eticheta: "A", pret: "40" as unknown as number }])]),
  });
  assert.ok(critice(r).includes("pret_optiune_nevalid"));
});

/* ── Greutatea optiunii ──────────────────────────────────────────────────── */

test("o GREUTATE care nu e numar nu se publica", () => {
  /*
   * ⚠ Gramele optiunii se aduna in greutatea coletului si pleaca la curier. Un `"750"` scris ca
   * text ar fi iesit `NaN` din adunare, iar coletul ar fi plecat pe rezerva de un kilogram — sau,
   * mai rau, cu o greutate nefinita in cererea catre API.
   */
  for (const grame of ["750" as unknown as number, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = val({ definitie: def([alegere("mat", [{ id: "a", eticheta: "A", grame }])]) });
    assert.ok(critice(r).includes("grame_optiune_nevalid"), `a trecut ${String(grame)}`);
    assert.equal(r.sePoatePublica, false);
  }
});

test("o greutate NEGATIVA nu se publica, desi un pret negativ se poate", () => {
  /*
   * ⚠ Aici cele doua campuri se despart. Un pret negativ e o hotarare comerciala („minus 10 lei
   * daca renunti la ambalaj"); o greutate negativa ar fi SCAZUT din colet, si „fara ambalaj" ar fi
   * facut comanda mai usoara decat produsul gol. Diferenta de banda o plateste comerciantul la
   * recantarirea din depozit.
   */
  const negativa = val({ definitie: def([alegere("mat", [{ id: "a", eticheta: "A", grame: -500 }])]) });
  assert.ok(critice(negativa).includes("grame_optiune_nevalid"));

  const pretNegativ = val({ definitie: def([alegere("mat", [{ id: "a", eticheta: "A", pret: -10 }])]) });
  assert.equal(pretNegativ.sePoatePublica, true, "reducerea pe optiune ramane ingaduita");
});

test("greutatea buna, ZERO si cea lipsa se publica", () => {
  for (const optiune of [
    { id: "a", eticheta: "A", grame: 750 },
    { id: "a", eticheta: "A", grame: 0 },
    { id: "a", eticheta: "A" },
  ]) {
    const r = val({ definitie: def([alegere("mat", [optiune])]) });
    assert.equal(r.sePoatePublica, true, `constatari: ${coduri(r).join(", ")}`);
    assert.ok(!coduri(r).includes("grame_optiune_nevalid"));
  }
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

/* ── Campul de incarcare ─────────────────────────────────────────────────── */

const fisiere = (extra: Record<string, unknown> = {}): Nod =>
  ({ fel: "fisiere", control: "imagine", id: "poza", eticheta: "Poza ta", ...extra } as Nod);

test("⚠ un camp de INCARCARE FISIERE se publica", () => {
  /*
   * ⚠ AICI STATEA UN REFUZ, si scoaterea lui e chiar livrarea lui F4.
   *
   * `ConfiguratorSlot` intorcea `null` pentru nodurile de fisiere, deci publicat campul ar fi fost
   * INVIZIBIL pe vitrina — iar daca era si obligatoriu, produsul n-ar mai fi putut fi cumparat
   * DELOC, fiindca `esteCerut` il cerea la fiecare incercare si nimeni n-avea unde sa-l completeze.
   *
   * Acum slotul il deseneaza, ruta il primeste, comanda il poarta si panoul il deschide. Proba
   * ramane aici, intoarsa pe fata cealalta: daca refuzul se intoarce vreodata, se vede.
   */
  const r = val({ definitie: def([alegere("mat", [{ id: "a", eticheta: "A" }]), fisiere()]) });
  assert.equal(r.sePoatePublica, true, critice(r).join(", "));
  assert.ok(!coduri(r).includes("fisiere_indisponibil"));
});

test("o cerinta de PIXELI pe un camp de DOCUMENTE se spune pe fata", () => {
  /*
   * ⚠ Un PDF n-are latime in pixeli, deci conditia nu se aplica niciodata. Nu strica nimic la
   * incarcare, dar ramane un numar scris care nu inseamna nimic — iar comerciantul crede ca a pus
   * o conditie. Se spune, si atat: `atentie`, fiindca nu e o vanzare gresita, e o asteptare gresita.
   */
  const d = def([fisiere({ control: "document", minLatimePx: 2000 })]);
  const r = val({ definitie: d });
  assert.ok(coduri(r).includes("fisiere_pixeli_pe_document"));
  assert.equal(r.sePoatePublica, true);
});

test("⚠ comerciantul afla ca plafonul e al platformei INAINTE de primul refuz", () => {
  /*
   * ⚠ El scrie 100 MB si primeste 25. Fara alarma asta ar fi aflat de la primul cumparator
   * caruia i s-a refuzat fisierul — adica de la o vanzare pierduta, si fara sa inteleaga de ce.
   */
  const r = val({ definitie: def([fisiere({ maxMb: 100, maxFisiere: 50 })]) });
  assert.ok(coduri(r).includes("fisiere_prea_mari"));
  assert.ok(coduri(r).includes("fisiere_prea_multe"));
  assert.equal(r.sePoatePublica, true, "un plafon depasit nu e o greseala, e o asteptare gresita");
});

test("un camp de incarcare obisnuit nu produce nicio alarma", () => {
  const r = val({ definitie: def([fisiere({ maxMb: 5, maxFisiere: 2, minLatimePx: 1200 })]) });
  assert.ok(!coduri(r).some((c) => c.startsWith("fisiere_")), coduri(r).join(", "));
});

test("CULOAREA se valideaza, fiindca modelul promite ca se valideaza", () => {
  /*
   * ⚠ `definitie.ts` scrie despre `Optiune.culoare` ca e „validata la publicare". Nu era: se citea
   * ca sir de cel mult 32 de caractere si ajungea de-a dreptul in `style`. Browserul o ignora,
   * pastila iese fara culoare, si comerciantul nu afla de ce.
   */
  const bune = val({
    definitie: def([alegere("mat", [
      { id: "a", eticheta: "A" }, { id: "b", eticheta: "B" }, { id: "c", eticheta: "C" },
    ])]),
  });
  assert.ok(!coduri(bune).includes("culoare_nevalida"), "fara culoare, nicio constatare");

  const cuCulori = def([{
    fel: "alegere", control: "culori", id: "mat", eticheta: "Material",
    optiuni: [
      { id: "a", eticheta: "A", culoare: "#fff" },
      { id: "b", eticheta: "B", culoare: "#a1b2c3" },
      { id: "c", eticheta: "C", culoare: "red" },
    ],
  } as Nod]);
  assert.ok(!coduri(val({ definitie: cuCulori })).includes("culoare_nevalida"), "formele bune trec");

  const stricate = def([{
    fel: "alegere", control: "culori", id: "mat", eticheta: "Material",
    optiuni: [{ id: "a", eticheta: "A", culoare: "rosu aprins;" }],
  } as Nod]);
  const r = val({ definitie: stricate });
  assert.ok(coduri(r).includes("culoare_nevalida"));
  // ⚠ E doar ATENTIE, nu critic: o pastila fara culoare se vinde in continuare.
  assert.ok(!critice(r).includes("culoare_nevalida"));
  assert.equal(r.sePoatePublica, true);
});

/* -- Cate bife se cer, fata de cate exista -------------------------------- */

const alegeri = (id: string, extra: Record<string, unknown>, cate = 2): Nod =>
  ({
    fel: "alegeri", control: "bifare", id, eticheta: id,
    optiuni: Array.from({ length: cate }, (_, i) => ({ id: `${id}${i}`, eticheta: `O${i}` })),
    ...extra,
  } as Nod);

test("un camp care cere MAI MULTE BIFE decat are optiuni nu se publica", () => {
  /*
   * ⚠ De cand campurile astea se pot scrie din panou, un „cel putin 5" pe un camp cu doua optiuni
   * se publica linistit — si produsul nu se mai poate comanda NICIODATA: verificarea raspunsului
   * cere cinci bife, iar cumparatorul n-are de unde sa le ia. Nimic nu cade si nimeni nu afla.
   */
  const r = val({ definitie: def([alegeri("e", { minAlese: 5 }, 2)]) });
  assert.equal(r.sePoatePublica, false);
  assert.ok(critice(r).includes("prea_putine_optiuni"));
});

test("minim mai mare decat maximul, la bife, nu se publica", () => {
  const r = val({ definitie: def([alegeri("e", { minAlese: 3, maxAlese: 1 }, 5)]) });
  assert.equal(r.sePoatePublica, false);
  assert.ok(critice(r).includes("alese_pe_dos"));
});

test("un numar negativ de alegeri nu se publica", () => {
  const r = val({ definitie: def([alegeri("e", { minAlese: -1 }, 3)]) });
  assert.equal(r.sePoatePublica, false);
  assert.ok(critice(r).includes("alese_negativ"));
});

test("limitele bune de bife trec mai departe", () => {
  const r = val({ definitie: def([alegeri("e", { minAlese: 1, maxAlese: 2 }, 3)]) });
  assert.ok(!coduri(r).some((c) => c.startsWith("alese_") || c === "prea_putine_optiuni"));
});

test("⚠ optiunile STINSE nu se numara la minim", () => {
  /*
   * Comerciantul a scos doua din vanzare. Numarate, campul ar fi parut ca are de unde alege — iar
   * cumparatorul ar fi vazut trei optiuni si i s-ar fi cerut patru.
   */
  const cuStinse = {
    fel: "alegeri", control: "bifare", id: "e", eticheta: "Extra", minAlese: 3,
    optiuni: [
      { id: "a", eticheta: "A" }, { id: "b", eticheta: "B" },
      { id: "c", eticheta: "C", activa: false }, { id: "d", eticheta: "D", activa: false },
    ],
  } as Nod;
  const r = val({ definitie: def([cuStinse]) });
  assert.ok(critice(r).includes("prea_putine_optiuni"));
});

/* ══════════════════════════════════════════════════════════════════════════
   REGULI SCRISE PE OPTIUNI CARE NU MAI SUNT
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ o regula care se APRINDE pe o optiune stearsa nu se publica", () => {
  /*
   * ⚠ CE SE INTAMPLA FARA ALARMA ASTA. Partea `atunci` era pazita de la inceput, partea
   * `cand` deloc. Deci comerciantul care sterge optiunea „Stejar” publica linistit regula
   * scrisa pe ea: o vede in lista, arata intreaga, si nu se aprinde niciodata. Nimic nu cade,
   * si singurul semn e ca magazinul se poarta altfel decat scriu propriile lui reguli — iar
   * comerciantul cauta greseala la el, luni intregi.
   */
  const reguli: Regula[] = [
    { id: "r", cand: { c: "este", nod: "mat", v: "stejar-sters" }, atunci: [{ a: "ascunde", tinta: "mat" }] },
  ];
  assert.ok(critice(val({ reguli })).includes("regula_conditie_optiune_lipsa"));
});

test("si prin `una_din`, si prin `si`/`sau` imbricate", () => {
  /*
   * ⚠ O conditie compusa e chiar forma in care se scriu regulile adevarate. Cautata doar la
   * suprafata, alarma ar fi lipsit tocmai de la regulile complicate — singurele pe care
   * comerciantul nu le poate verifica din ochi.
   */
  const reguli: Regula[] = [{
    id: "r",
    cand: {
      c: "sau",
      din: [
        { c: "si", din: [{ c: "una_din", nod: "mat", v: ["a", "zzz"] }] },
      ],
    },
    atunci: [{ a: "ascunde", tinta: "mat" }],
  }];
  assert.ok(critice(val({ reguli })).includes("regula_conditie_optiune_lipsa"));
});

test("o regula scrisa pe o optiune STINSA e doar atentie, nu opreste publicarea", () => {
  /*
   * ⚠ Deosebirea e a COMERCIANTULUI, nu a codului. Pe optiunea stearsa nu poate hotari nimic;
   * pe cea stinsa poate — poate a scos-o din vanzare o luna si vrea sa se intoarca la ea, cu tot
   * cu regula scrisa pe ea. Oprita publicarea, l-am fi silit sa-si stearga regula ca s-o
   * rescrie peste o luna.
   */
  const d = def([alegere("mat", [
    { id: "a", eticheta: "A" },
    { id: "stejar", eticheta: "Stejar", activa: false },
  ])]);
  const reguli: Regula[] = [
    { id: "r", cand: { c: "este", nod: "mat", v: "stejar" }, atunci: [{ a: "ascunde", tinta: "mat" }] },
  ];
  const r = val({ definitie: d, reguli });
  assert.ok(coduri(r).includes("regula_conditie_optiune_stinsa"));
  assert.ok(!critice(r).includes("regula_conditie_optiune_stinsa"));
  assert.equal(r.sePoatePublica, true);
});

test("o regula scrisa pe o optiune VIE nu supara pe nimeni", () => {
  const reguli: Regula[] = [
    { id: "r", cand: { c: "este", nod: "mat", v: "a" }, atunci: [{ a: "ascunde", tinta: "mat" }] },
  ];
  const c = coduri(val({ reguli }));
  assert.ok(!c.includes("regula_conditie_optiune_lipsa"));
  assert.ok(!c.includes("regula_conditie_optiune_stinsa"));
});

test("⚠ un TEXT sau un NUMAR comparat nu se ia drept id de optiune", () => {
  /*
   * ⚠ `contine`/`incepe_cu` cauta intr-un text scris de cumparator, iar `cmp`/`intre` compara
   * numere: acolo `v` nu e id-ul nimanui. Cerut sa fie, alarma ar fi sunat pe FIECARE regula
   * sanatoasa — si o alarma care suna mereu e una pe care nimeni n-o mai citeste.
   */
  const d = def([{ fel: "text", control: "scurt", id: "grav", eticheta: "Gravura" } as Nod, numar("lat")]);
  const reguli: Regula[] = [
    { id: "r1", cand: { c: "contine", nod: "grav", v: "zzz" }, atunci: [{ a: "ascunde", tinta: "lat" }] },
    { id: "r2", cand: { c: "cmp", nod: "lat", op: ">", v: 10 }, atunci: [{ a: "ascunde", tinta: "grav" }] },
  ];
  const c = coduri(val({ definitie: d, reguli }));
  assert.ok(!c.includes("regula_conditie_optiune_lipsa"), c.join(", "));
});

test("o conditie pe un camp care NU are optiuni nu produce alarma de optiune", () => {
  // ⚠ `completat` merge pe orice fel de nod. Cerut sa numeasca o optiune, ar fi sunat degeaba.
  const d = def([numar("lat")]);
  const reguli: Regula[] = [
    { id: "r", cand: { c: "completat", nod: "lat" }, atunci: [{ a: "ascunde", tinta: "lat" }] },
  ];
  assert.ok(!coduri(val({ definitie: d, reguli })).includes("regula_conditie_optiune_lipsa"));
});
