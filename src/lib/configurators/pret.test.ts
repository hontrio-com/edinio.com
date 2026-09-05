import test from "node:test";
import assert from "node:assert/strict";
import { calculeazaPretul, pretDeAfisat, pretulTextului, type Pretuire } from "./pret";
import { aplicaRegulile, type Regula, type Stare } from "./reguli";
import type { Definitie, Nod } from "./definitie";
import { normalizeazaValori, type Valori } from "./valori";
import { bin, num, ref } from "./expresii";
import { inMilimetri, round2 } from "./unitati";

/* ── Schele ──────────────────────────────────────────────────────────────── */

function def(noduri: Nod[], calcule?: Record<string, ReturnType<typeof num>>): Definitie {
  return {
    versiuneSchema: 1, mod: "auto",
    pasi: [{ id: "p1", eticheta: "Pas", grupuri: [{ id: "g1", noduri }] }],
    ...(calcule ? { calcule } : {}),
  };
}

const v = (o: Record<string, unknown>): Valori => normalizeazaValori(o);

/** Starea data de motorul de reguli, cand nu se probeaza chiar regulile. */
function stare(d: Definitie, valori: Valori, reguli: Regula[] = []): Stare {
  return aplicaRegulile(d, reguli, valori);
}

function pret(
  d: Definitie, p: Pretuire, valori: Valori,
  extra: { pretProdus?: number; reguli?: Regula[]; componente?: { id: string; eticheta: string; suma: number }[] } = {},
) {
  return calculeazaPretul({
    definitie: d, pretuire: p, stare: stare(d, valori, extra.reguli ?? []),
    pretProdus: extra.pretProdus ?? 0, componente: extra.componente,
  });
}

/** Descompunerea, cand se stie ca merge. */
function ok(r: ReturnType<typeof calculeazaPretul>) {
  assert.ok(r.ok, `asteptam un pret, a iesit ${r.ok ? "" : r.cod}`);
  return r.d;
}
function cod(r: ReturnType<typeof calculeazaPretul>): string {
  assert.ok(!r.ok, "asteptam o eroare");
  return r.cod;
}

/* ── Baza ────────────────────────────────────────────────────────────────── */

test("cele trei feluri de baza", () => {
  const d = def([]);
  assert.equal(ok(pret(d, { baza: "produs" }, v({}), { pretProdus: 89 })).unitar, 89);
  assert.equal(ok(pret(d, { baza: "fara" }, v({}), { pretProdus: 89 })).unitar, 0);
  assert.equal(ok(pret(d, { baza: "taxa", taxaInitiala: 25 }, v({}), { pretProdus: 89 })).unitar, 25);
});

test("o baza necunoscuta se refuza, nu se ghiceste", () => {
  assert.equal(cod(pret(def([]), { baza: "de-maine" } as never, v({}))), "baza_nevalida");
});

/* ── Cazul din plan ──────────────────────────────────────────────────────── */

test("CAZUL DIN PLAN: fototapet 350 x 256 cm la 89 lei/m² = 797,44 lei", () => {
  const d = def(
    [
      { fel: "numar", control: "camp", id: "l", eticheta: "Latime" },
      { fel: "numar", control: "camp", id: "h", eticheta: "Inaltime" },
    ] as Nod[],
    { suprafata: bin("impart", bin("inmultesc", ref("l"), ref("h")), num(1_000_000)) },
  );
  const p: Pretuire = { baza: "fara", formula: bin("inmultesc", ref("suprafata"), num(89)) };
  const val = v({
    l: { f: "numar", v: inMilimetri(350, "cm") },
    h: { f: "numar", v: inMilimetri(256, "cm") },
  });
  const r = ok(pret(d, p, val));
  assert.equal(round2(r.calcul), 797.44);
  assert.equal(pretDeAfisat(r), 797.44);
});

/* ── Optiunile ───────────────────────────────────────────────────────────── */

const D_OPT = def([
  {
    fel: "alegere", control: "lista", id: "mat", eticheta: "Material",
    optiuni: [
      { id: "std", eticheta: "Standard", pret: 0 },
      { id: "prem", eticheta: "Premium", pret: 40 },
    ],
  },
  { fel: "comutator", control: "comutator", id: "cadou", eticheta: "Ambalaj cadou", pret: 15 },
  {
    fel: "text", control: "scurt", id: "grav", eticheta: "Gravura",
    pret: { fix: 20, peCaracter: 2, caractereIncluse: 5 },
  },
] as Nod[]);

test("optiunile aleg si adauga, si se vad desfacut", () => {
  const r = ok(pret(D_OPT, { baza: "produs" }, v({
    mat: { f: "alegere", v: "prem" },
    cadou: { f: "comutator", v: true },
  }), { pretProdus: 100 }));
  assert.equal(r.unitar, 155);
  assert.deepEqual(r.optiuni.map((o) => o.suma).sort((a, b) => a - b), [15, 40]);
});

test("pretul pe caracter socoteste doar peste cele incluse", () => {
  const nodGrav = D_OPT.pasi[0].grupuri[0].noduri[2];
  // 5 incluse, „Robert" are 6 -> 20 + 1 x 2
  assert.equal(pretulTextului(nodGrav, v({ grav: { f: "text", v: "Robert" } })), 22);
  // Exact 5 -> doar fixul
  assert.equal(pretulTextului(nodGrav, v({ grav: { f: "text", v: "Maria" } })), 20);
  // Necompletat -> nimic
  assert.equal(pretulTextului(nodGrav, v({})), 0);
  assert.equal(pretulTextului(nodGrav, v({ grav: { f: "text", v: "   " } })), 0);
});

test("se numara CARACTERE, nu unitati UTF-16", () => {
  /*
   * Un emoji ocupa doua unitati UTF-16. Numarate asa, cumparatorul ar fi platit dublu pentru
   * fiecare — si tot asa pentru o litera cu semn diacritic compus.
   */
  const nodGrav = D_OPT.pasi[0].grupuri[0].noduri[2];
  // 6 caractere vazute de om, dintre care unul e un emoji: 5 incluse -> un singur caracter platit
  assert.equal(pretulTextului(nodGrav, v({ grav: { f: "text", v: "Ana\u{1F600}bc" } })), 22);
});

test("CAMPUL ASCUNS NU PLATESTE", () => {
  /*
   * Cumparatorul nu mai vede alegerea, deci n-are voie sa fie taxat pentru ea. Se verifica si
   * in `pret.ts`, nu doar prin golirea valorilor, ca pretul sa nu atarne de faptul ca altcineva
   * a curatat inainte.
   */
  const reguli: Regula[] = [
    { id: "r", cand: { c: "este", nod: "mat", v: "std" }, atunci: [{ a: "ascunde", tinta: "cadou" }] },
  ];
  const r = ok(pret(D_OPT, { baza: "produs" }, v({
    mat: { f: "alegere", v: "std" },
    cadou: { f: "comutator", v: true },
  }), { pretProdus: 100, reguli }));
  assert.equal(r.unitar, 100, "ambalajul ascuns nu se plateste");
  assert.equal(r.optiuni.length, 0);
});

/* ── Ordinea ─────────────────────────────────────────────────────────────── */

test("ORDINEA E SCRISA: procentul se socoteste DUPA adaosurile fixe", () => {
  /*
   * 100 baza + 20 fix = 120, apoi 10% din 120 = 12 -> 132.
   * Daca procentul s-ar aplica inaintea fixului, ar iesi 100 + 10 + 20 = 130.
   */
  const p: Pretuire = {
    baza: "produs",
    modificatori: [
      { id: "m2", fel: "procent", valoare: 10, baza: "subtotal" },
      { id: "m1", fel: "fix", valoare: 20 },
    ],
  };
  const r = ok(pret(def([]), p, v({}), { pretProdus: 100 }));
  assert.equal(r.unitar, 132);
});

test("ordinea NU depinde de pozitia in lista", () => {
  const facute = (mods: Pretuire["modificatori"]) =>
    ok(pret(def([]), { baza: "produs", modificatori: mods }, v({}), { pretProdus: 100 })).unitar;
  const a = facute([{ id: "f", fel: "fix", valoare: 20 }, { id: "p", fel: "procent", valoare: 10, baza: "subtotal" }]);
  const b = facute([{ id: "p", fel: "procent", valoare: 10, baza: "subtotal" }, { id: "f", fel: "fix", valoare: 20 }]);
  assert.equal(a, b, "o reasezare in interfata nu are voie sa schimbe pretul");
  assert.equal(a, 132);
});

test("BAZA procentului e scrisa pe fata, si chiar se respecta", () => {
  const d = def([], { c: num(50) });
  const cu = (baza: "baza" | "calcul" | "subtotal") => ok(pret(d, {
    baza: "produs", formula: ref("c"),
    modificatori: [
      { id: "f", fel: "fix", valoare: 10 },
      { id: "p", fel: "procent", valoare: 10, baza },
    ],
  }, v({}), { pretProdus: 100 })).unitar;
  // baza 100, calcul 50, fix 10 -> subtotal 160
  assert.equal(cu("baza"), 170, "10% din 100");
  assert.equal(cu("calcul"), 165, "10% din 50");
  assert.equal(cu("subtotal"), 176, "10% din 160");
});

test("inmultirea scrie DIFERENTA in descompunere, nu totalul", () => {
  const r = ok(pret(def([]), {
    baza: "produs", modificatori: [{ id: "x2", fel: "inmultire", valoare: 2 }],
  }, v({}), { pretProdus: 100 }));
  assert.equal(r.unitar, 200);
  assert.equal(r.proportionale[0].suma, 100, "cat a ADAUGAT, ca sa se poata citi descompunerea");
});

test("un modificator conditionat se aplica doar cand se aprinde", () => {
  const d = def([{
    fel: "alegere", control: "lista", id: "urgent", eticheta: "Urgenta",
    optiuni: [{ id: "da", eticheta: "Da" }, { id: "nu", eticheta: "Nu" }],
  }] as Nod[]);
  const p: Pretuire = {
    baza: "produs",
    modificatori: [{ id: "u", fel: "procent", valoare: 50, baza: "baza", cand: { c: "este", nod: "urgent", v: "da" } }],
  };
  assert.equal(ok(pret(d, p, v({ urgent: { f: "alegere", v: "da" } }), { pretProdus: 100 })).unitar, 150);
  assert.equal(ok(pret(d, p, v({ urgent: { f: "alegere", v: "nu" } }), { pretProdus: 100 })).unitar, 100);
});

/* ── Componente, limite, rotunjire ───────────────────────────────────────── */

test("componentele intra in suma", () => {
  const r = ok(pret(def([]), { baza: "fara" }, v({}), {
    componente: [{ id: "blat", eticheta: "Blat", suma: 120 }, { id: "picior", eticheta: "Picior", suma: 80 }],
  }));
  assert.equal(r.unitar, 200);
});

test("pretul minim si cel maxim", () => {
  const d = def([]);
  assert.equal(ok(pret(d, { baza: "produs", minim: 150 }, v({}), { pretProdus: 100 })).unitar, 150);
  assert.equal(ok(pret(d, { baza: "produs", maxim: 80 }, v({}), { pretProdus: 100 })).unitar, 80);
  // Limitele pe dos sunt o definitie stricata, nu ceva de prins tacut.
  assert.equal(cod(pret(d, { baza: "produs", minim: 200, maxim: 100 }, v({}), { pretProdus: 100 })), "limite_pe_dos");
});

test("rotunjirea comerciala, la pasul cerut", () => {
  const d = def([]);
  const p = (fel: "aproape" | "insus" | "injos") =>
    ok(pret(d, { baza: "produs", rotunjire: { fel, pas: 5 } }, v({}), { pretProdus: 797.44 })).unitar;
  assert.equal(p("insus"), 800);
  assert.equal(p("injos"), 795);
  assert.equal(p("aproape"), 795);
  // Un pas de zero nu rotunjeste nimic; nu strica pretul.
  assert.equal(ok(pret(d, { baza: "produs", rotunjire: { fel: "insus", pas: 0 } }, v({}), { pretProdus: 797.44 })).unitar, 797.44);
});

test("limita se aplica INAINTEA rotunjirii", () => {
  // 100 ridicat la minimul 150, apoi rotunjit in sus la 200.
  const r = ok(pret(def([]), { baza: "produs", minim: 150, rotunjire: { fel: "insus", pas: 200 } }, v({}), { pretProdus: 100 }));
  assert.equal(r.dupaLimite, 150);
  assert.equal(r.unitar, 200);
});

/* ── Nimic nu cade pe zero ───────────────────────────────────────────────── */

test("un pret NEGATIV se refuza, nu se prinde la zero", () => {
  /*
   * Taiat tacit la zero, comerciantul n-ar afla niciodata ca formula lui e gresita — si ar fi
   * vandut pe gratis. Iar dus mai departe, ar fi ajuns o comanda din care magazinul plateste.
   */
  const r = pret(def([]), { baza: "produs", modificatori: [{ id: "m", fel: "fix", valoare: -500 }] }, v({}), { pretProdus: 100 });
  assert.equal(cod(r), "pret_negativ");
});

test("o formula care nu se poate calcula NU da un pret", () => {
  const d = def([]);
  assert.equal(cod(pret(d, { baza: "fara", formula: ref("nu-exista") }, v({}))), "referinta_lipsa");
  assert.equal(
    cod(pret(d, { baza: "fara", formula: bin("impart", num(1), num(0)) }, v({}))),
    "impartire_la_zero",
  );
});

test("un modificator cu formula stricata opreste tot calculul", () => {
  const r = pret(def([]), {
    baza: "produs",
    modificatori: [{ id: "m", fel: "fix", formula: bin("impart", num(1), num(0)) }],
  }, v({}), { pretProdus: 100 });
  assert.equal(cod(r), "impartire_la_zero");
});

test("revarsarea peste limita numerelor iese ca eroare", () => {
  const r = pret(def([]), {
    baza: "produs", modificatori: [{ id: "m", fel: "inmultire", valoare: 1e308 }],
  }, v({}), { pretProdus: 1e300 });
  assert.equal(cod(r), "rezultat_nefinit");
});

/* ── Descompunerea si pretul unitar ──────────────────────────────────────── */

test("descompunerea se aduna EXACT la pretul brut", () => {
  const r = ok(pret(D_OPT, {
    baza: "produs",
    modificatori: [{ id: "f", fel: "fix", valoare: 10 }, { id: "p", fel: "procent", valoare: 10, baza: "subtotal" }],
  }, v({ mat: { f: "alegere", v: "prem" }, grav: { f: "text", v: "Robert" } }), {
    pretProdus: 100, componente: [{ id: "c", eticheta: "C", suma: 5 }],
  }));
  const suma = r.baza + r.calcul
    + r.optiuni.reduce((s, x) => s + x.suma, 0)
    + r.fixe.reduce((s, x) => s + x.suma, 0)
    + r.proportionale.reduce((s, x) => s + x.suma, 0)
    + r.componente.reduce((s, x) => s + x.suma, 0);
  assert.equal(round2(suma), round2(r.brut), "descompunerea trebuie sa explice chiar totalul");
});

test("pretul unitar ramane NEROTUNJIT; rotunjirea e doar pentru ecran", () => {
  /*
   * `pret x cantitate` trebuie sa dea exact subtotalul liniei — aceeasi regula pe care o tin
   * `order.actions.ts` si `quantity-tiers.ts`. Rotunjit aici, suma liniilor n-ar mai da totalul
   * comenzii, si asta pe documentul dupa care se factureaza.
   */
  const d = def([], { c: bin("impart", num(100), num(3)) });
  const r = ok(pret(d, { baza: "fara", formula: ref("c") }, v({})));
  assert.equal(r.unitar, 100 / 3);
  assert.notEqual(r.unitar, 33.33);
  assert.equal(pretDeAfisat(r), 33.33);
  assert.equal(round2(r.unitar * 3), 100, "unitar x cantitate da inapoi totalul");
});

test("acelasi calcul da acelasi numar, de fiecare data", () => {
  const val = v({ mat: { f: "alegere", v: "prem" }, grav: { f: "text", v: "Robert" } });
  const intai = ok(pret(D_OPT, { baza: "produs" }, val, { pretProdus: 100 })).unitar;
  for (let i = 0; i < 50; i++) {
    assert.equal(ok(pret(D_OPT, { baza: "produs" }, val, { pretProdus: 100 })).unitar, intai);
  }
});

test("A DOUA INCUIETOARE: ascunsul nu plateste nici daca valoarea a ramas pe el", () => {
  /*
   * ⚠ Proba „CAMPUL ASCUNS NU PLATESTE" de mai sus trece si FARA verificarea din `pret.ts`,
   * fiindca motorul de reguli goleste el valoarea campului ascuns. Deci ea apara golirea, nu
   * paza din calculul pretului.
   *
   * Aici starea se compune de mana: campul e ascuns SI valoarea a ramas pe el. E cazul in care
   * cineva cheama `calculeazaPretul` cu o stare venita de altundeva — din instantaneul unei
   * comenzi vechi, dintr-o repretuire, dintr-o proba. Pretul nu are voie sa atarne de faptul ca
   * altcineva a curatat inainte.
   */
  const stareCuFantoma: Stare = {
    ascunse: new Set(["cadou"]),
    dezactivate: new Set(), obligatorii: new Set(), optionale: new Set(),
    optiuniPermise: new Map(), optiuniScoase: new Map(), limite: new Map(),
    mesaje: [], opriri: [], conflicte: [], neasezat: false,
    valori: v({ mat: { f: "alegere", v: "std" }, cadou: { f: "comutator", v: true } }),
  };
  const r = calculeazaPretul({
    definitie: D_OPT, pretuire: { baza: "produs" }, stare: stareCuFantoma, pretProdus: 100,
  });
  assert.ok(r.ok);
  assert.equal(r.d.unitar, 100, "valoarea fantoma de pe un camp ascuns nu se taxeaza");
  assert.equal(r.d.optiuni.length, 0);
});
