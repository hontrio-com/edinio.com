import test from "node:test";
import assert from "node:assert/strict";
import {
  componentaEStricata, componenteleCerute, consumulConfiguratiei, consumulPeStare,
  contopesteConsumul, costulComponentelor, decrementeleComponentelor, numelePieselor,
  trimiterileLaComponente,
  MAX_BUCATI_PE_LINIE, MAX_BUCATI_PE_OPTIUNE,
} from "./componente";
import {
  compileaza, pentruSursaPaginii, VERSIUNE_COMPILAT,
  type Compilat, type ComponentaRezolvata,
} from "./compileaza";
import { readFileSync } from "node:fs";
import path from "node:path";
import { citesteDefinitie } from "./citeste";
import { verificaRaspunsul } from "./raspuns";
import { verdictulLiniei } from "./repretuire";
import { valideaza } from "./validare";
import { aplicaRegulile, type Regula } from "./reguli";
import type { Definitie, Nod, Optiune } from "./definitie";
import { normalizeazaValori, type Valori } from "./valori";

/**
 * O usa cu patru balamale nu consuma nicio balama.
 *
 * `Optiune.componenta` se parsa, se compila si nu o citea nimeni: `validare.ts` n-o verifica,
 * iar pasul 6 din `pret.ts` primea `componente` de la un apelant care nu exista. Deci optiunea
 * nu costa nimic si nu scadea nimic — comerciantul completa campul, il vedea salvat, si dadea
 * piesele pe gratis pana le termina din depozit, fara nicio eroare nicaieri.
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

type OptiuneProba = Partial<Optiune> & { id: string; eticheta: string };

const alegere = (id: string, optiuni: OptiuneProba[]): Nod =>
  ({ fel: "alegere", control: "lista", id, eticheta: id, optiuni } as Nod);

const alegeri = (id: string, optiuni: OptiuneProba[]): Nod =>
  ({ fel: "alegeri", control: "bifare", id, eticheta: id, optiuni } as Nod);

/** Piesa asa cum o scrie publicarea: id, bucati, plus ce s-a inghetat din baza. */
const piesa = (id: string, bucati: number, extra: Record<string, unknown> = {}) =>
  ({ id, bucati, ...extra });

const FERONERIE = alegere("fer", [
  { id: "simpla", eticheta: "Simpla", componenta: piesa("balama", 2, { produsId: "P-BAL", pretBucata: 9, nume: "Balama 35 mm" }) },
  { id: "grea", eticheta: "Grea", componenta: piesa("balama", 4, { produsId: "P-BAL", pretBucata: 9, nume: "Balama 35 mm" }) },
  { id: "fara", eticheta: "Fara feronerie" },
]);

/* ═══════════════════════════════════════════════════════════════════════════
   CONSUMUL
   ═══════════════════════════════════════════════════════════════════════════ */

test("piesele optiunii alese se numara", () => {
  const c = comp(def([FERONERIE]));
  assert.deepEqual(
    consumulConfiguratiei(c, v({ fer: { f: "alegere", v: "grea" } })).map((x) => [x.id, x.bucati]),
    [["balama", 4]],
  );
  assert.deepEqual(
    consumulConfiguratiei(c, v({ fer: { f: "alegere", v: "simpla" } })).map((x) => [x.id, x.bucati]),
    [["balama", 2]],
  );
});

test("o optiune FARA componenta nu consuma nimic", () => {
  assert.deepEqual(consumulConfiguratiei(comp(def([FERONERIE])), v({ fer: { f: "alegere", v: "fara" } })), []);
});

test("nicio alegere facuta inseamna zero, nu componenta primei optiuni", () => {
  /*
   * ⚠ Mutant: `optiunileAlese` care ar cadea pe prima optiune cand nu s-a ales nimic. Atunci
   * fiecare produs configurat, inclusiv cele pe care nimeni nu le-a atins, ar fi scazut cate doua
   * balamale la fiecare comanda.
   */
  assert.deepEqual(consumulConfiguratiei(comp(def([FERONERIE])), v({})), []);
});

test("ALEGERI MULTIPLE: fiecare bifa isi cere piesele", () => {
  const d = def([alegeri("acc", [
    { id: "a", eticheta: "Manere", componenta: piesa("maner", 2, { produsId: "P-MAN" }) },
    { id: "b", eticheta: "Opritor", componenta: piesa("opritor", 1, { produsId: "P-OPR" }) },
  ])]);
  const r = consumulConfiguratiei(comp(d), v({ acc: { f: "alegeri", v: ["a", "b"] } }));
  assert.deepEqual(r.map((x) => [x.id, x.bucati]).sort(), [["maner", 2], ["opritor", 1]]);
});

test("ACEEASI piesa ceruta de doua noduri se INSUMEAZA intr-un singur rand", () => {
  /*
   * ⚠ Mutant: `insumate.set(c.id, c)` in loc de adunare — ultimul castiga. Atunci o usa cu
   * feronerie grea (4) SI cu un set de balamale suplimentare (2) ar fi scazut 2, nu 6: patru
   * balamale ar fi plecat din depozit la fiecare usa, fara ca nicio comanda s-o arate.
   *
   * Si mutantul invers, doua randuri in loc de unul: `decrementeleComponentelor` le-ar fi
   * insumat oricum pe produs, dar descompunerea de pret ar fi aratat „Balama 35 mm" de doua ori,
   * cu doua sume, iar clientul n-ar fi stiut ce plateste.
   */
  const d = def(
    [alegere("fer", [{ id: "grea", eticheta: "Grea", componenta: piesa("balama", 4, { produsId: "P-BAL", pretBucata: 9 }) }])],
    [alegeri("supl", [{ id: "s", eticheta: "Set suplimentar", componenta: piesa("balama", 2, { produsId: "P-BAL", pretBucata: 9 }) }])],
  );
  const r = consumulConfiguratiei(comp(d), v({
    fer: { f: "alegere", v: "grea" },
    supl: { f: "alegeri", v: ["s"] },
  }));
  assert.equal(r.length, 1, "un singur rand pe piesa");
  assert.equal(r[0].bucati, 6);
});

/* ── Campurile ascunse ───────────────────────────────────────────────────── */

test("o optiune ASCUNSA de reguli nu consuma — aceeasi stare ca pretul", () => {
  /*
   * ⚠ Mutant: se scoate `esteAscuns` din bucla. Proba de mai jos cade, si asta e rostul ei.
   *
   * Fara paza, un camp pe care regulile l-au scos de pe ecran ar fi consumat mai departe: din
   * depozit ar fi plecat balamalele unei usi pe care cumparatorul n-o mai vede si n-o plateste.
   * Se trece printr-o stare pe care motorul de reguli N-A golit-o, ca sa se probeze chiar paza,
   * nu efectul secundar al golirii.
   */
  const d = def([
    alegere("tip", [{ id: "sertar", eticheta: "Sertar" }, { id: "usa", eticheta: "Usa" }]),
    FERONERIE,
  ]);
  const reguli: Regula[] = [{
    id: "r1",
    cand: { c: "este", nod: "tip", v: "sertar" },
    atunci: [{ a: "ascunde", tinta: "fer" }],
  }];

  const valoriAlese = v({ tip: { f: "alegere", v: "sertar" }, fer: { f: "alegere", v: "grea" } });
  const stare = aplicaRegulile(d, reguli, valoriAlese);
  // Starea reala are `fer` golit; i se pune valoarea la loc, ca paza sa fie chiar incercata.
  const stareCuValoare = { ...stare, valori: { ...stare.valori, fer: valoriAlese.fer } };

  assert.deepEqual(consumulPeStare(d, stareCuValoare), [], "ascunsa nu consuma");
  // Si cand nu e ascunsa, chiar consuma — altfel proba de sus ar fi trecut degeaba.
  assert.equal(
    consumulConfiguratiei(comp(d, reguli), v({ tip: { f: "alegere", v: "usa" }, fer: { f: "alegere", v: "grea" } }))
      .length,
    1,
  );
});

/* ── Citirea defensiva ───────────────────────────────────────────────────── */

test("un `bucati` care nu e numar pozitiv NU consuma", () => {
  /*
   * ⚠ Mutant: `Number(r.bucati)` in loc de `eNumarBun`. „2" ca sir ar fi trecut, iar „doua" ar fi
   * devenit `NaN` si de acolo ar fi plecat in `quantity` — pe care baza il trece prin `::int` si
   * cade cu tot cu comanda.
   */
  for (const rau of ["4", null, 0, -3, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
    const d = def([alegere("x", [{ id: "o", eticheta: "O", componenta: { id: "p", bucati: rau } as never }])]);
    assert.deepEqual(
      consumulConfiguratiei(comp(d), v({ x: { f: "alegere", v: "o" } })), [],
      `bucati = ${JSON.stringify(rau)}`,
    );
  }
});

test("un `componenta` fara id, sau de alta forma, se arunca fara sa arunce", () => {
  for (const rau of [null, 7, "balama", [], { bucati: 2 }, { id: "   ", bucati: 2 }]) {
    const d = def([alegere("x", [{ id: "o", eticheta: "O", componenta: rau as never }])]);
    assert.deepEqual(consumulConfiguratiei(comp(d), v({ x: { f: "alegere", v: "o" } })), []);
  }
});

test("un `pretBucata` NEGATIV se ignora: consumul nu da bani inapoi", () => {
  /*
   * ⚠ Mutant: se primeste orice numar finit. Atunci cumparatorul si-ar fi ieftinit comanda
   * alegand exact ce ne costa pe noi mai mult, si cu cat mai multe bucati, cu atat mai ieftin.
   * Piesa tot se scade din depozit; numai plata merge invers.
   */
  const d = def([alegere("x", [
    { id: "o", eticheta: "O", componenta: piesa("p", 3, { pretBucata: -10, produsId: "P" }) },
  ])]);
  const consum = consumulConfiguratiei(comp(d), v({ x: { f: "alegere", v: "o" } }));
  assert.equal(consum[0].pretBucata, undefined);
  assert.deepEqual(costulComponentelor(consum), [], "nu scade pretul");
  assert.deepEqual(decrementeleComponentelor(consum, 1), [{ product_id: "P", quantity: 3 }], "dar tot se scade din stoc");
});

test("bucatile unei optiuni sunt plafonate", () => {
  const d = def([alegere("x", [{ id: "o", eticheta: "O", componenta: piesa("p", 1e12, { produsId: "P" }) }])]);
  const consum = consumulConfiguratiei(comp(d), v({ x: { f: "alegere", v: "o" } }));
  assert.equal(consum[0].bucati, MAX_BUCATI_PE_OPTIUNE);
});

/* ═══════════════════════════════════════════════════════════════════════════
   PASUL 6 DIN PRET
   ═══════════════════════════════════════════════════════════════════════════ */

test("costul pieselor iese ca linii de descompunere, cu numele inghetat", () => {
  const consum = consumulConfiguratiei(comp(def([FERONERIE])), v({ fer: { f: "alegere", v: "grea" } }));
  assert.deepEqual(costulComponentelor(consum), [{ id: "balama", eticheta: "Balama 35 mm", suma: 36 }]);
});

test("o piesa FARA `pretBucata` nu adauga nimic la pret", () => {
  /*
   * ⚠ Mutant: se cade pe un pret ghicit (zero e inofensiv, dar `pretBucata ?? 1` n-ar fi).
   * Versiunile publicate INAINTE de fisierul asta n-au campul deloc; scumpite acum, ele si-ar fi
   * schimbat pretul dupa publicare — desi tot modelul spune ca sunt imutabile.
   */
  const d = def([alegere("x", [{ id: "o", eticheta: "O", componenta: piesa("p", 5, { produsId: "P" }) }])]);
  assert.deepEqual(costulComponentelor(consumulConfiguratiei(comp(d), v({ x: { f: "alegere", v: "o" } }))), []);
});

test("⚠ `verificaRaspunsul` CHIAR trimite piesele la pasul 6", () => {
  /*
   * ⚠ Proba care inchide defectul de la care a pornit tot fisierul: `calculeazaPretul` primea
   * `componente` de la nimeni. Mutant: se scoate `componente:` din apelul din `raspuns.ts` —
   * pretul cade de la 136 la 100 si proba cade cu el.
   */
  const verdict = verificaRaspunsul(comp(def([FERONERIE])), { fer: { f: "alegere", v: "grea" } }, 100);
  assert.ok(verdict.ok);
  assert.equal(verdict.unitar, 136, "100 lei produsul + 4 balamale x 9 lei");
  assert.deepEqual(verdict.descompunere.componente, [{ id: "balama", eticheta: "Balama 35 mm", suma: 36 }]);
});

test("⚠ pretul pieselor e ACELASI numar pe amandoua partile", () => {
  /*
   * Browserul si serverul cheama chiar functia asta, cu chiar `compilat`-ul publicat: pretul
   * piesei e inghetat acolo, nu citit din baza la fiecare cerere. Proba tine lipita hotararea —
   * daca cineva ar face pasul 6 sa depinda de o citire, browserul (care n-o poate face) ar arata
   * alt numar decat cel incasat.
   */
  const c = comp(def([FERONERIE]));
  const brut = { fer: { f: "alegere", v: "simpla" } };
  const caLaBrowser = verificaRaspunsul(c, brut, 250);
  const caLaServer = verificaRaspunsul(c, JSON.parse(JSON.stringify(brut)), 250);
  assert.ok(caLaBrowser.ok && caLaServer.ok);
  assert.equal(caLaBrowser.unitar, caLaServer.unitar);
  assert.equal(caLaBrowser.unitar, 268);
});

/* ═══════════════════════════════════════════════════════════════════════════
   SCADEREA DIN STOC
   ═══════════════════════════════════════════════════════════════════════════ */

test("consumul se inmulteste cu CANTITATEA liniei", () => {
  /*
   * ⚠ Mutant: se trimit bucatile per produs, fara inmultire. Trei usi ar fi scazut patru
   * balamale in loc de douasprezece — opt ar fi plecat din depozit nevazute la fiecare comanda.
   */
  const consum = consumulConfiguratiei(comp(def([FERONERIE])), v({ fer: { f: "alegere", v: "grea" } }));
  assert.deepEqual(decrementeleComponentelor(consum, 3), [{ product_id: "P-BAL", quantity: 12 }]);
  assert.deepEqual(decrementeleComponentelor(consum, 1), [{ product_id: "P-BAL", quantity: 4 }]);
});

test("o piesa FARA `produsId` nu scade nimic, dar poate costa", () => {
  const d = def([alegere("x", [
    { id: "o", eticheta: "Manopera", componenta: piesa("man", 2, { pretBucata: 40, nume: "Ora de montaj" }) },
  ])]);
  const consum = consumulConfiguratiei(comp(d), v({ x: { f: "alegere", v: "o" } }));
  assert.deepEqual(decrementeleComponentelor(consum, 5), []);
  assert.deepEqual(costulComponentelor(consum), [{ id: "man", eticheta: "Ora de montaj", suma: 80 }]);
});

test("⚠ bucatile fractionare se rotunjesc IN SUS, si numai la final", () => {
  /*
   * ⚠ DOI mutanti, si amandoi costa:
   *
   *   `Math.floor` — un sfert de tub pe usa: patru usi ar fi consumat ZERO tuburi, si depozitul
   *   ar fi ramas fara ele fara ca vreo comanda s-o arate.
   *
   *   rotunjire pe BUCATA, nu pe linie — 0,25 ar fi devenit 1 pe fiecare usa, deci 4 tuburi la
   *   patru usi in loc de unul: de patru ori mai multa marfa scoasa din stoc decat se foloseste.
   *
   * Si un motiv mecanic: `revendica_stoc_complet` face `(i->>'quantity')::int`, iar Postgres NU
   * primeste „0.25" acolo — cade instructiunea, deci cade toata comanda.
   */
  const d = def([alegere("x", [{ id: "o", eticheta: "O", componenta: piesa("silicon", 0.25, { produsId: "P-SIL" }) }])]);
  const consum = consumulConfiguratiei(comp(d), v({ x: { f: "alegere", v: "o" } }));
  assert.deepEqual(decrementeleComponentelor(consum, 4), [{ product_id: "P-SIL", quantity: 1 }]);
  assert.deepEqual(decrementeleComponentelor(consum, 5), [{ product_id: "P-SIL", quantity: 2 }]);
  assert.deepEqual(decrementeleComponentelor(consum, 1), [{ product_id: "P-SIL", quantity: 1 }]);
});

test("doua piese pe ACELASI produs se contopesc intr-o singura scadere", () => {
  const d = def([alegeri("acc", [
    { id: "a", eticheta: "Set A", componenta: piesa("surub-scurt", 4, { produsId: "P-SUR" }) },
    { id: "b", eticheta: "Set B", componenta: piesa("surub-lung", 2, { produsId: "P-SUR" }) },
  ])]);
  const consum = consumulConfiguratiei(comp(d), v({ acc: { f: "alegeri", v: ["a", "b"] } }));
  assert.deepEqual(decrementeleComponentelor(consum, 2), [{ product_id: "P-SUR", quantity: 12 }]);
});

test("cantitatea plafonata nu poate depasi un `int4` din Postgres", () => {
  const d = def([alegere("x", [{ id: "o", eticheta: "O", componenta: piesa("p", 90_000, { produsId: "P" }) }])]);
  const consum = consumulConfiguratiei(comp(d), v({ x: { f: "alegere", v: "o" } }));
  const dec = decrementeleComponentelor(consum, 1_000_000);
  assert.equal(dec[0].quantity, MAX_BUCATI_PE_LINIE);
  assert.ok(dec[0].quantity < 2_147_483_647);
  assert.ok(Number.isInteger(dec[0].quantity));
});

test("o cantitate stricata se citeste ca o bucata, nu ca zero si nu ca NaN", () => {
  const consum = consumulConfiguratiei(comp(def([FERONERIE])), v({ fer: { f: "alegere", v: "grea" } }));
  for (const rau of [Number.NaN, 0, -5, 0.4]) {
    assert.deepEqual(decrementeleComponentelor(consum, rau), [{ product_id: "P-BAL", quantity: 4 }], String(rau));
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLICAREA
   ═══════════════════════════════════════════════════════════════════════════ */

const PIESE = new Map<string, ComponentaRezolvata>([
  ["balama", { produsId: "P-BAL", pretBucata: 9, nume: "Balama 35 mm" }],
]);

test("compilarea INGHEATA pretul, produsul si numele piesei", () => {
  const d = def([alegere("fer", [
    { id: "grea", eticheta: "Grea", componenta: { id: "balama", bucati: 4 } },
  ])]);
  const c = compileaza(d, [], { baza: "produs" }, PIESE);
  const o = (c.definitie.pasi[0].grupuri[0].noduri[0] as Extract<Nod, { fel: "alegere" }>).optiuni[0];
  assert.deepEqual(o.componenta, { id: "balama", bucati: 4, produsId: "P-BAL", pretBucata: 9, nume: "Balama 35 mm" });
});

test("⚠ compilarea NU crede ce sta in ciorna despre pret sau produs", () => {
  /*
   * ⚠ Mutant: `optiunePentruVitrina` copiaza `o.componenta.pretBucata` cand harta n-are piesa.
   *
   * Ciorna e un `jsonb` scris de panou, adica de oricine ajunge la actiunea de salvare. Copiat,
   * un `pretBucata: 0` pus de mana ar fi devenit chiar pretul dupa care se incaseaza, iar un
   * `produsId` strain ar fi scazut stocul unui produs care n-are nicio treaba cu configuratorul —
   * si publicarea i-ar fi inghetat pe amandoi intr-o versiune IMUTABILA.
   */
  const d = def([alegere("fer", [{
    id: "grea", eticheta: "Grea",
    componenta: piesa("balama", 4, { produsId: "AL-ALTUIA", pretBucata: 0, nume: "Gratis" }) as never,
  }])]);
  const c = compileaza(d, [], { baza: "produs" }, new Map());
  const o = (c.definitie.pasi[0].grupuri[0].noduri[0] as Extract<Nod, { fel: "alegere" }>).optiuni[0];
  assert.deepEqual(o.componenta, { id: "balama", bucati: 4 }, "raman doar id-ul si bucatile");
});

test("⚠ `citeste.ts` arunca campurile inghetate cand vin dintr-o ciorna", () => {
  /*
   * A doua incuietoare pe aceeasi usa, la celalalt capat: chiar daca cineva scrie campurile in
   * `configuratoare.ciorna`, ele nu apuca sa ajunga la `compileaza`.
   */
  const citita = citesteDefinitie({
    versiuneSchema: 1, mod: "auto",
    pasi: [{ id: "p", eticheta: "P", grupuri: [{ id: "g", noduri: [{
      fel: "alegere", control: "lista", id: "fer", eticheta: "Feronerie",
      optiuni: [{ id: "grea", eticheta: "Grea", componenta: { id: "balama", bucati: 4, produsId: "AL-ALTUIA", pretBucata: 0 } }],
    }] }] }],
  });
  assert.ok(citita);
  const o = (citita.pasi[0].grupuri[0].noduri[0] as Extract<Nod, { fel: "alegere" }>).optiuni[0];
  assert.deepEqual(o.componenta, { id: "balama", bucati: 4 });
});

test("compilarea fara harta lasa forma de azi neatinsa", () => {
  // Apelantii vechi (si probele lor) cheama `compileaza` cu trei argumente.
  const d = def([alegere("fer", [{ id: "grea", eticheta: "Grea", componenta: { id: "balama", bucati: 4 } }])]);
  const c = compileaza(d, [], { baza: "produs" });
  const o = (c.definitie.pasi[0].grupuri[0].noduri[0] as Extract<Nod, { fel: "alegere" }>).optiuni[0];
  assert.deepEqual(o.componenta, { id: "balama", bucati: 4 });
});

/* ── Ce cere definitia ───────────────────────────────────────────────────── */

test("trimiterile se numara si pe optiunile STINSE", () => {
  /*
   * ⚠ Mutant: se sar optiunile cu `activa: false`. O optiune stinsa se reaprinde dintr-un clic,
   * si atunci nimeni nu mai valideaza nimic: piesa fantoma ar fi intrat in vanzare direct.
   */
  const d = def([alegere("fer", [
    { id: "a", eticheta: "A", componenta: { id: "balama", bucati: 2 } },
    { id: "b", eticheta: "B", activa: false, componenta: { id: "maner", bucati: 1 } },
  ])]);
  assert.deepEqual(componenteleCerute(d).sort(), ["balama", "maner"]);
  assert.equal(trimiterileLaComponente(d).length, 2);
  assert.deepEqual(trimiterileLaComponente(d)[1], {
    nodId: "fer", nodEticheta: "fer", optiuneEticheta: "B", componentaId: "maner",
  });
});

test("acelasi id cerut de doua optiuni apare O SINGURA data in lista de cerut", () => {
  const d = def([FERONERIE]);
  assert.deepEqual(componenteleCerute(d), ["balama"]);
});

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDAREA
   ═══════════════════════════════════════════════════════════════════════════ */

const coduri = (r: { constatari: { cod: string }[] }) => r.constatari.map((c) => c.cod);

test("⚠ o piesa FANTOMA opreste publicarea", () => {
  /*
   * ⚠ Mutant: constatarea se pune pe `atentie` in loc de `critic`. Versiunea ar fi plecat cu
   * `componenta` fara `produsId` si fara `pretBucata` — adica alegerea nu costa nimic si nu scade
   * nimic — si ar fi ramas asa PE VECI, fiindca versiunile publicate sunt imutabile.
   */
  const d = def([alegere("fer", [
    { id: "grea", eticheta: "Grea", componenta: { id: "balama-stearsa", bucati: 4 } },
  ])]);
  const r = valideaza({ definitie: d, reguli: [], pretuire: { baza: "produs" }, componenteCunoscute: ["balama"] });
  assert.ok(coduri(r).includes("componenta_fantoma"));
  assert.equal(r.sePoatePublica, false);
  // Si numeste optiunea, ca omul sa stie unde sa se uite.
  const c = r.constatari.find((x) => x.cod === "componenta_fantoma")!;
  assert.match(c.mesaj, /Grea/);
  assert.equal(c.tinta, "fer");
});

test("o piesa care EXISTA nu opreste nimic", () => {
  const d = def([alegere("fer", [
    { id: "grea", eticheta: "Grea", componenta: { id: "balama", bucati: 4 } },
  ])]);
  const r = valideaza({ definitie: d, reguli: [], pretuire: { baza: "produs" }, componenteCunoscute: ["balama"] });
  assert.ok(!coduri(r).includes("componenta_fantoma"));
  assert.equal(r.sePoatePublica, true);
});

test("⚠ FARA lista de piese nu se strica nimic: `undefined` inseamna „n-am intrebat”", () => {
  /*
   * ⚠ Mutant: `intrare.componenteCunoscute ?? []`. Previzualizarea din panou ruleaza validatorul
   * pe ciorna din memorie, fara nicio citire — si atunci comerciantul si-ar fi vazut TOATE
   * piesele raportate ca fantome, la fiecare tasta, pe un configurator perfect bun.
   */
  const d = def([alegere("fer", [
    { id: "grea", eticheta: "Grea", componenta: { id: "balama", bucati: 4 } },
  ])]);
  const r = valideaza({ definitie: d, reguli: [], pretuire: { baza: "produs" } });
  assert.ok(!coduri(r).includes("componenta_fantoma"));
  assert.equal(r.sePoatePublica, true);
});

test("un `bucati` stricat se SPUNE, nu dispare in tacere", () => {
  /*
   * `citeste.ts` arunca componenta intreaga cand `bucati` nu e un numar pozitiv — si bine face.
   * Dar comerciantul care scrie „doua" in loc de „2" vede campul salvat si publica linistit, iar
   * piesele nu se scad niciodata. Validatorul ruleaza si pe ciorna din memorie, unde campul e
   * inca acolo: singurul loc unde tacerea aia se poate transforma intr-o propozitie pe ecran.
   */
  const d = def([alegere("fer", [
    { id: "grea", eticheta: "Grea", componenta: { id: "balama", bucati: "doua" } as never },
  ])]);
  const r = valideaza({ definitie: d, reguli: [], pretuire: { baza: "produs" } });
  assert.ok(coduri(r).includes("componenta_nevalida"));
  assert.equal(r.sePoatePublica, false);
  assert.equal(componentaEStricata({ id: "x", eticheta: "X" }), false, "lipsa nu e stricata");
});

/* ── Contopirea cu scaderile comenzii ────────────────────────────────────── */

test("⚠ aceeasi balama vanduta la bucata SI consumata se ADUNA intr-un rand", () => {
  /*
   * ⚠ Mutant: concatenare in loc de adunare. `revendica_stoc_complet` insumeaza el pe produs,
   * deci refuzul ar fi ramas corect — dar `stocRezervat` scrie lista INTOCMAI in
   * `orders.stoc_rezervat`, iar de acolo se socoteste ce se da inapoi la editare si la anulare.
   * Doua randuri pentru acelasi produs sunt exact forma pe care `scade_din_rezervat` n-o vede
   * niciodata azi.
   */
  assert.deepEqual(
    contopesteConsumul([{ product_id: "P-BAL", quantity: 1 }], [{ product_id: "P-BAL", quantity: 4 }]),
    [{ product_id: "P-BAL", quantity: 5 }],
  );
});

test("contopirea pastreaza ordinea si nu pierde niciun produs", () => {
  assert.deepEqual(
    contopesteConsumul(
      [{ product_id: "usa", quantity: 2 }, { product_id: "P-BAL", quantity: 1 }],
      [{ product_id: "P-SUR", quantity: 8 }, { product_id: "P-BAL", quantity: 4 }],
    ),
    [
      { product_id: "usa", quantity: 2 },
      { product_id: "P-BAL", quantity: 5 },
      { product_id: "P-SUR", quantity: 8 },
    ],
  );
});

test("contopirea arunca randurile fara produs, cu zero, sau cu cantitati stricate", () => {
  /*
   * ⚠ Ce ar fi costat: un `quantity` de `NaN` sau fractionar pleaca in `(i->>'quantity')::int`,
   * iar Postgres refuza sirul — cade instructiunea, deci cade toata comanda, si nu numai linia.
   */
  const r = contopesteConsumul(
    [{ product_id: "", quantity: 3 }, { product_id: "A", quantity: Number.NaN }],
    [{ product_id: "B", quantity: 0 }, { product_id: "C", quantity: 2.7 }],
  );
  assert.deepEqual(r, [{ product_id: "C", quantity: 2 }]);
  for (const x of r) assert.ok(Number.isInteger(x.quantity));
});

test("fara nicio piesa, lista comenzii ramane exact cum era", () => {
  const dec = [{ product_id: "usa", quantity: 2 }];
  assert.deepEqual(contopesteConsumul(dec, []), dec);
});

test("⚠ VERDICTUL LINIEI chiar poarta consumul catre scaderea din stoc", () => {
  /*
   * ⚠ A DOUA JUMATATE A ACELUIASI DEFECT, si singura care mai lipsea.
   *
   * Pasul 6 are apelant (proba de mai sus), deci piesele COSTA. Dar scaderea din stoc pleaca de
   * pe `PretConfigurat.consum`, si acolo nu se uita nicio proba: pus pe `[]`, `tsc` da zero,
   * toate probele raman verzi, si fiecare comanda configurata nu mai scade nicio piesa. Adica
   * exact defectul „pasul 6 fara apelant" de la care s-a pornit, mutat cu un nivel mai sus.
   *
   * Aici se cere ce iese din `verdictulLiniei`, care e chiar ce citesc cele trei cai de comanda.
   */
  const identitate = { configuratorId: "c1", versiuneId: "v1", numarVersiune: 1 };
  const r = verdictulLiniei(comp(def([FERONERIE])), { fer: { f: "alegere", v: "grea" } }, 100, identitate);
  assert.equal(r.fel, "ok");
  if (r.fel !== "ok") return;
  assert.deepEqual(
    r.consum.map((c) => ({ id: c.id, bucati: c.bucati })),
    [{ id: "balama", bucati: 4 }],
    "consumul nu mai ajunge pe verdict: comanda n-ar mai scadea nicio piesa",
  );
  assert.equal(r.unitar, 136, "si pretul ramane cel cu piese");
});

test("⚠ un camp ASCUNS nu consuma nici prin verdictul liniei", () => {
  // Aceeasi regula ca la pret si la greutate, pe drumul care chiar scade stocul.
  const cu = def([
    { fel: "comutator", control: "comutator", id: "simplu", eticheta: "Simplu" } as Nod,
    FERONERIE,
  ]);
  const reguli = [{
    id: "r1", cand: { c: "pornit" as const, nod: "simplu" },
    atunci: [{ a: "ascunde" as const, tinta: "fer" }],
  }];
  const c = { ...comp(cu), reguli } as typeof FERONERIE extends never ? never : ReturnType<typeof comp>;
  const r = verdictulLiniei(
    c,
    { simplu: { f: "comutator", v: true }, fer: { f: "alegere", v: "grea" } },
    100,
    { configuratorId: "c1", versiuneId: "v1", numarVersiune: 1 },
  );
  assert.equal(r.fel, "ok");
  if (r.fel !== "ok") return;
  assert.deepEqual(r.consum, [], "o piesa ascunsa s-ar fi scazut din stoc fara sa fie platita");
});

/* ══════════════════════════════════════════════════════════════════════════
   CINE E PIESA SI CINE E MARFA
   ══════════════════════════════════════════════════════════════════════════ */

test("piesa care nu e in cos iese cu numele ei de la publicare", () => {
  /*
   * ⚠ Numele care iese e cel INGHETAT (`nume`), nu `products.name`. Al doilea e numele intern
   * al unui rand de stoc tinut stins dinadins — comerciantul nu vrea sa-l stie nimeni, si nici
   * n-ar ajuta pe nimeni. Primul apare oricum in descompunerea de pret pe care o vede
   * cumparatorul inainte sa plateasca.
   */
  const m = numelePieselor(
    [{ product_id: "usa" }],
    [{ id: "b1", bucati: 4, produsId: "balama", nume: "Balama ascunsa" }],
  );
  assert.deepEqual([...m], [["balama", "Balama ascunsa"]]);
});

test("piesa care e SI marfa din cos NU intra in lista", () => {
  /*
   * ⚠ Aceeasi balama poate fi vanduta la bucata SI consumata de o usa configurata, in aceeasi
   * comanda. Atunci omul chiar o are in cos, deci „scoate-o din cos” e sfatul bun, si el vine
   * din mesajul de produs. Lasata in lista, ar fi primit in loc „alege alta optiune” pentru un
   * lucru pe care il poate pur si simplu scoate.
   */
  const m = numelePieselor(
    [{ product_id: "balama" }, { product_id: "usa" }],
    [{ id: "b1", bucati: 4, produsId: "balama", nume: "Balama ascunsa" }],
  );
  assert.deepEqual([...m], []);
});

test("piesa fara nume intra totusi in lista, cu sirul gol", () => {
  /*
   * ⚠ Important e sa NU cada pe mesajul de produs, nu sa aiba nume. O versiune publicata mai
   * demult poate sa n-aiba numele inghetat; sarita de aici, tocmai ea ar fi scapat numele
   * intern la client — adica exact acolo unde nimeni nu se mai uita.
   */
  const m = numelePieselor([], [{ id: "b1", bucati: 1, produsId: "p" }]);
  assert.deepEqual([...m], [["p", ""]]);
});

test("piesa care nu se tine pe stoc nu are ce cauta in lista", () => {
  // Fara `produsId` nu scade nimic, deci nu poate nici sa refuze o comanda.
  const m = numelePieselor([], [{ id: "b1", bucati: 1, nume: "Manopera" }]);
  assert.equal(m.size, 0);
});

test("doua optiuni care cer aceeasi piesa nu se bat pe nume", () => {
  const m = numelePieselor([], [
    { id: "b1", bucati: 2, produsId: "p", nume: "" },
    { id: "b2", bucati: 2, produsId: "p", nume: "Balama ascunsa" },
  ]);
  assert.deepEqual([...m], [["p", "Balama ascunsa"]], "numele gol a batut numele bun");
});

test("numele lung se taie aici, nu in mesaj", () => {
  const m = numelePieselor([], [{ id: "b1", bucati: 1, produsId: "p", nume: "x".repeat(200) }]);
  assert.equal(m.get("p")?.length, 60);
});

/* ══════════════════════════════════════════════════════════════════════════
   CE PLEACA LA BROWSER
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ `produsId` NU pleaca in sursa paginii", () => {
  /*
   * ⚠ CE ERA LA VEDERE. `produsId` e `products.id` al randului din care se scade stocul piesei
   * — un rand tinut STINS dinadins, fiindca balamaua nu se vinde la bucata. El ajungea intreg
   * in incarcatura paginii de produs, pentru orice vizitator, si nu servea nimic: nota de
   * deasupra lui `optiunePentruVitrina` promitea un ecran cu „mai sunt 3 in stoc” care nu exista
   * si nici n-ar putea — `configurator_componente` n-are nicio politica publica.
   */
  const c = comp(def([FERONERIE]));
  assert.ok(JSON.stringify(c).includes("P-BAL"), "proba nu mai vede piesa; s-a schimbat fixtura");

  assert.equal(
    JSON.stringify(pentruSursaPaginii(c)).includes("P-BAL"), false,
    "id-ul produsului ascuns pleaca in continuare la browser",
  );
});

test("ce FOLOSESTE browserul ramane intreg", () => {
  /*
   * ⚠ Perechea obligatorie a probei de mai sus. `bucati` intra in pretul pe care il socoteste
   * si browserul, iar `nume` apare in descompunerea pe care o vede cumparatorul. Taiate odata
   * cu `produsId`, pretul de pe ecran ar fi ramas sub cel incasat — si nimic n-ar fi cazut,
   * fiindca serverul socoteste din alta copie.
   */
  const vitrina = pentruSursaPaginii(comp(def([FERONERIE])));
  const consum = consumulConfiguratiei(vitrina, v({ fer: { f: "alegere", v: "grea" } }));
  assert.equal(consum.length, 1);
  assert.equal(consum[0].bucati, 4);
  assert.equal(consum[0].pretBucata, 9);
  assert.equal(consum[0].nume, "Balama 35 mm");
  assert.equal(consum[0].produsId, undefined);
});

test("originalul ramane intreg: calea de server scade in continuare stocul", () => {
  /*
   * ⚠ Taierea nu are voie sa atinga obiectul primit. Repretuirea comenzii citeste prin ACEEASI
   * functie de incarcare, iar daca taierea ar fi lucrat pe loc, o pagina de produs randata
   * inainte ar fi lasat comanda de dupa ea fara nicio piesa de scazut.
   */
  const c = comp(def([FERONERIE]));
  pentruSursaPaginii(c);
  const consum = consumulConfiguratiei(c, v({ fer: { f: "alegere", v: "grea" } }));
  assert.equal(consum[0].produsId, "P-BAL", "originalul a fost ciuntit pe loc");
});

test("un configurator FARA piese se intoarce neatins", () => {
  // Aproape niciunul n-are piese: acolo nu se copiaza nimic degeaba.
  const c = comp(def([alegere("culoare", [{ id: "alb", eticheta: "Alb" }])]));
  assert.equal(pentruSursaPaginii(c), c);
});

test("⚠ pagina de produs CHIAR taie inainte sa trimita", () => {
  /*
   * ⚠ Functia probata mai sus nu apara nimic daca n-o cheama nimeni, iar locul unde trebuie
   * chemata e unul singur: `enrichStoreProduct` e SINGURUL drum prin care trec amandoua
   * intrarile in pagina de produs. De acolo raspunsul pleaca drept prop catre o componenta de
   * client, deci scos de sub taiere ar fi din nou la vedere — si nimic n-ar cadea.
   */
  const s = readFileSync(
    path.resolve(process.cwd(), "src/lib/storefront/product-data.ts"), "utf8",
  ).replace(/\r\n/g, "\n");
  assert.match(
    s,
    /configurator: cfg \? \{ \.\.\.cfg, compilat: pentruSursaPaginii\(cfg\.compilat\) \} : null/,
    "pagina de produs trimite versiunea publicata neatinsa",
  );
});
