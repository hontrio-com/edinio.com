import test from "node:test";
import assert from "node:assert/strict";
import { grameleConfiguratiei, gramelePeStare } from "./greutate";
import { calculeazaPretul } from "./pret";
import { aplicaRegulile, type Regula, type Stare } from "./reguli";
import { VERSIUNE_COMPILAT, type Compilat } from "./compileaza";
import type { Definitie, Nod } from "./definitie";
import { normalizeazaValori, type Valori } from "./valori";

/**
 * O cana cu cutie de lemn cantarea exact cat cana goala.
 *
 * `Optiune.grame` era parsat, compilat si trimis vitrinei, dar nu-l aduna nimeni: coletul pleca la
 * toti cei saisprezece curieri cu greutatea produsului din catalog. Curierul cantareste la depozit
 * si refactureaza banda adevarata, iar diferenta o plateste comerciantul.
 */

/* ── Schele ──────────────────────────────────────────────────────────────── */

function def(noduri: Nod[], pas2?: Nod[]): Definitie {
  const pasi = [{ id: "p1", eticheta: "Pas", grupuri: [{ id: "g1", noduri }] }];
  if (pas2) pasi.push({ id: "p2", eticheta: "Pas doi", grupuri: [{ id: "g2", noduri: pas2 }] });
  return { versiuneSchema: 1, mod: "auto", pasi };
}

function comp(d: Definitie, reguli: Regula[] = []): Compilat {
  return { v: VERSIUNE_COMPILAT, definitie: d, reguli, pretuire: { baza: "produs" } };
}

const v = (o: Record<string, unknown>): Valori => normalizeazaValori(o);

type OptiuneProba = { id: string; eticheta: string; grame?: number; pret?: number; activa?: boolean };

const alegere = (id: string, optiuni: OptiuneProba[]): Nod =>
  ({ fel: "alegere", control: "lista", id, eticheta: id, optiuni } as Nod);

const alegeri = (id: string, optiuni: OptiuneProba[]): Nod =>
  ({ fel: "alegeri", control: "bifare", id, eticheta: id, optiuni } as Nod);

const AMBALAJ = alegere("amb", [
  { id: "punga", eticheta: "Punga", grame: 20 },
  { id: "cutie", eticheta: "Cutie de lemn", grame: 750 },
  { id: "fara", eticheta: "Fara ambalaj" },
]);

/* ── Adunarea ────────────────────────────────────────────────────────────── */

test("gramele optiunii alese se aduna", () => {
  assert.equal(grameleConfiguratiei(comp(def([AMBALAJ])), v({ amb: { f: "alegere", v: "cutie" } })), 750);
  assert.equal(grameleConfiguratiei(comp(def([AMBALAJ])), v({ amb: { f: "alegere", v: "punga" } })), 20);
});

test("o optiune FARA grame nu cantareste", () => {
  // Cazul obisnuit: comerciantul completeaza greutatea doar acolo unde conteaza.
  assert.equal(grameleConfiguratiei(comp(def([AMBALAJ])), v({ amb: { f: "alegere", v: "fara" } })), 0);
});

test("nicio alegere facuta inseamna zero, nu greutatea primei optiuni", () => {
  assert.equal(grameleConfiguratiei(comp(def([AMBALAJ])), v({})), 0);
});

test("ALEGERI MULTIPLE: fiecare bifa isi adauga gramele ei", () => {
  /*
   * ⚠ Un `alegeri` cu trei bifate trebuie sa cantareasca cat toate trei. Numarata doar prima —
   * greseala fireasca daca se scrie „valoarea nodului" in loc de „optiunile alese" — un colet cu
   * trei accesorii ar fi plecat cu greutatea unuia singur.
   */
  const d = def([alegeri("acc", [
    { id: "a", eticheta: "Suport", grame: 300 },
    { id: "b", eticheta: "Capac", grame: 120 },
    { id: "c", eticheta: "Perie", grame: 45 },
  ])]);
  assert.equal(grameleConfiguratiei(comp(d), v({ acc: { f: "alegeri", v: ["a", "b", "c"] } })), 465);
  assert.equal(grameleConfiguratiei(comp(d), v({ acc: { f: "alegeri", v: ["b"] } })), 120);
  assert.equal(grameleConfiguratiei(comp(d), v({ acc: { f: "alegeri", v: [] } })), 0);
});

test("mai multe noduri se aduna intre ele", () => {
  const d = def([AMBALAJ], [alegeri("acc", [{ id: "a", eticheta: "Suport", grame: 300 }])]);
  const r = grameleConfiguratiei(comp(d), v({
    amb: { f: "alegere", v: "cutie" },
    acc: { f: "alegeri", v: ["a"] },
  }));
  assert.equal(r, 1050);
});

/* ── Campurile ascunse ───────────────────────────────────────────────────── */

test("o optiune ASCUNSA de reguli nu cantareste — aceeasi stare ca pretul", () => {
  /*
   * ⚠ Campul ascuns nu plateste (`pret.ts`, pasul 3). Daca ar cantari, coletul ar fi plecat cu
   * gramele unui ambalaj pe care cumparatorul nu-l mai vede si nu l-a platit — iar comerciantul
   * ar fi cumparat o banda de tarif mai scumpa pentru nimic.
   */
  const d = def([
    { fel: "comutator", control: "comutator", id: "cadou", eticheta: "Impachetare cadou" } as Nod,
    AMBALAJ,
  ]);
  const reguli: Regula[] = [{ id: "r1", cand: { c: "oprit", nod: "cadou" }, atunci: [{ a: "ascunde", tinta: "amb" }] }];
  const valori = v({ amb: { f: "alegere", v: "cutie" } });

  assert.equal(grameleConfiguratiei(comp(d, reguli), valori), 0, "ascuns, ambalajul nu cantareste");
  assert.equal(grameleConfiguratiei(comp(d, []), valori), 750, "fara regula, cantareste");
});

test("un nod ascuns nu cantareste nici cand valoarea lui a RAMAS in stare", () => {
  /*
   * ⚠ Proba care chiar apasa pe garda, nu pe efectul ei lateral.
   *
   * `aplicaRegulile` goleste singur valorile campurilor ascunse, deci pe drumul obisnuit gramele
   * ies zero si fara verificarea din `gramelePeStare` — adica o proba dusa numai prin
   * `grameleConfiguratiei` trece si dupa ce garda a fost stearsa. Aici starea se compune de mana,
   * cu nodul ascuns SI cu valoarea lui la locul ei: exact ce aduce un apelant care si-a construit
   * singur starea. Fara garda, coletul ar fi plecat cu gramele unui ambalaj pe care cumparatorul
   * nu-l mai vede si nu l-a platit.
   */
  const d = def([AMBALAJ]);
  const cuValoarea = (ascunse: string[]): Stare => ({
    ascunse: new Set(ascunse),
    dezactivate: new Set(),
    obligatorii: new Set(),
    optionale: new Set(),
    optiuniPermise: new Map(),
    optiuniScoase: new Map(),
    limite: new Map(),
    mesaje: [],
    opriri: [],
    conflicte: [],
    valori: v({ amb: { f: "alegere", v: "cutie" } }),
    neasezat: false,
  });

  assert.equal(gramelePeStare(d, cuValoarea([])), 750, "neascunsa, cutia cantareste");
  assert.equal(gramelePeStare(d, cuValoarea(["amb"])), 0, "nodul ascuns");
  assert.equal(gramelePeStare(d, cuValoarea(["g1"])), 0, "grupul ascuns");
  assert.equal(gramelePeStare(d, cuValoarea(["p1"])), 0, "pasul ascuns");
});

test("un GRUP ascuns isi duce nodurile cu el", () => {
  const d = def([
    { fel: "comutator", control: "comutator", id: "cadou", eticheta: "Impachetare cadou" } as Nod,
  ], [AMBALAJ]);
  const reguli: Regula[] = [{ id: "r1", cand: { c: "oprit", nod: "cadou" }, atunci: [{ a: "ascunde", tinta: "g2" }] }];
  assert.equal(grameleConfiguratiei(comp(d, reguli), v({ amb: { f: "alegere", v: "cutie" } })), 0);
});

test("greutatea si pretul se hotarasc pe ACEEASI multime de optiuni", () => {
  /*
   * ⚠ Proba care leaga cele doua socoteli. Scrise pe multimi diferite, ele ar fi divergit la prima
   * regula noua, si divergenta s-ar fi vazut ca „ambalajul pe care nu l-a ales nimeni ingreuneaza
   * coletul". Aici se cere ca ce nu plateste sa nu cantareasca, si invers.
   */
  const d = def([
    { fel: "comutator", control: "comutator", id: "cadou", eticheta: "Impachetare cadou" } as Nod,
    alegere("amb", [{ id: "cutie", eticheta: "Cutie de lemn", grame: 750, pret: 40 }]),
  ]);
  const reguli: Regula[] = [{ id: "r1", cand: { c: "oprit", nod: "cadou" }, atunci: [{ a: "ascunde", tinta: "amb" }] }];
  const valori = v({ amb: { f: "alegere", v: "cutie" } });

  for (const r of [[], reguli]) {
    const stare = aplicaRegulile(d, r as Regula[], valori);
    const pret = calculeazaPretul({ definitie: d, pretuire: { baza: "fara" }, stare, pretProdus: 0 });
    assert.ok(pret.ok);
    const grame = gramelePeStare(d, stare);
    assert.equal(
      grame > 0, pret.d.unitar > 0,
      `ce plateste ${pret.d.unitar} trebuie sa si cantareasca (${grame} g)`,
    );
  }
});

/* ── Ce nu are voie sa arunce ────────────────────────────────────────────── */

test("valorile aiurea nu arunca si nu inventeaza greutate", () => {
  const d = comp(def([AMBALAJ]));
  for (const brut of [null, undefined, 7, "cutie", [], { amb: 3 }, { amb: { f: "text", v: "cutie" } },
    { amb: { f: "alegere", v: "nu-exista" } }, { amb: { f: "alegere" } }]) {
    let r = -1;
    assert.doesNotThrow(() => { r = grameleConfiguratiei(d, brut); }, `a aruncat pe ${JSON.stringify(brut)}`);
    assert.equal(r, 0, `${JSON.stringify(brut)} a produs greutate`);
  }
});

test("un compilat lipsa sau gol da zero, nu o exceptie", () => {
  assert.equal(grameleConfiguratiei(undefined, { amb: { f: "alegere", v: "cutie" } }), 0);
  assert.equal(grameleConfiguratiei({ v: 1, definitie: undefined } as unknown as Compilat, {}), 0);
});

test("gramele NEGATIVE nu scad din colet", () => {
  /*
   * ⚠ Publicarea le refuza deja (`grame_optiune_nevalid`), dar o versiune compilata inainte de
   * regula aceea inca le poate purta. Scazute, „fara ambalaj" ar fi facut coletul mai usor decat
   * produsul gol — si banda de tarif greseala o plateste comerciantul.
   */
  const d = def([alegeri("acc", [
    { id: "cutie", eticheta: "Cutie", grame: 750 },
    { id: "minus", eticheta: "Fara ambalaj", grame: -500 },
  ])]);
  // ⚠ Amestecata cu una buna, nu singura: pusa singura, suma negativa ar fi fost taiata oricum de
  // garda de la iesire, si proba ar fi trecut si dupa ce clema de pe optiune era stearsa.
  assert.equal(grameleConfiguratiei(comp(d), v({ acc: { f: "alegeri", v: ["cutie", "minus"] } })), 750);
  assert.equal(grameleConfiguratiei(comp(d), v({ acc: { f: "alegeri", v: ["minus"] } })), 0);
});

test("o greutate nefinita nu otraveste adunarea", () => {
  // `Infinity` si `NaN` ajung in jsonb din orice import; trimise mai departe, ar fi devenit
  // greutatea coletului in cererea catre curier.
  const d = def([alegeri("acc", [
    { id: "bun", eticheta: "Bun", grame: 200 },
    { id: "rau", eticheta: "Rau", grame: Number.POSITIVE_INFINITY },
    { id: "nan", eticheta: "Nan", grame: Number.NaN },
  ])]);
  assert.equal(grameleConfiguratiei(comp(d), v({ acc: { f: "alegeri", v: ["bun", "rau", "nan"] } })), 200);
});

test("o greutate scrisa ca TEXT nu se converteste tacut", () => {
  // `"750"` nu e o greutate, e o definitie stricata. Convertita binevoitor aici, comerciantul
  // n-ar fi aflat niciodata ca a scris-o gresit.
  const d = def([alegere("amb", [{ id: "cutie", eticheta: "Cutie", grame: "750" } as unknown as OptiuneProba])]);
  assert.equal(grameleConfiguratiei(comp(d), v({ amb: { f: "alegere", v: "cutie" } })), 0);
});
