import test from "node:test";
import assert from "node:assert/strict";
import {
  ceDeseneaza, cutiaZonei, nodurileAsezateInPreviz, nodurileCareSePotDesena,
  previzualizareaDeDesenat, MAX_ZONE,
} from "./previzualizare";
import { aplicaRegulile, type Regula } from "./reguli";
import { normalizeazaValori } from "./valori";
import type { Definitie, Nod, NodAfisaj, ZonaPreviz } from "./definitie";

/**
 * Gravura lui, pe cana lui.
 *
 * ═══ ⚠ CE APARA PROBELE DE AICI ═══
 *
 * Previzualizarea nu intra in pret, in greutate, in amprenta sau in comanda: e o asemanare care
 * il opreste pe cumparator sa comande „Familia Ionesku". Deci nimic de aici nu poate vinde gresit.
 *
 * Ce POATE face, si ce se pazeste mai jos: sa doboare pagina de produs (o definitie veche, un nod
 * sters), sa arate ALTCEVA decat s-a ales (un camp ascuns de o regula, desenat mai departe), sau
 * sa nu arate nimic si sa para stricata.
 */

const zona = (extra: Partial<ZonaPreviz> = {}): ZonaPreviz =>
  ({ nod: "grav", x: 0.2, y: 0.3, l: 0.5, i: 0.2, ...extra });

const previz = (zone: ZonaPreviz[], imagine = "/cana.jpg"): Nod =>
  ({ fel: "afisaj", control: "previzualizare", id: "prv", eticheta: "Cum arata",
     previzualizare: { imagine, zone } } as Nod);

const text = (id = "grav"): Nod =>
  ({ fel: "text", control: "scurt", id, eticheta: "Gravura" } as Nod);

const def = (noduri: Nod[]): Definitie =>
  ({ versiuneSchema: 1, mod: "auto", pasi: [{ id: "p1", eticheta: "Pas", grupuri: [{ id: "g1", noduri }] }] });

const deDesenat = (d: Definitie, valori: Record<string, unknown> = {}, reguli: Regula[] = []) => {
  const nod = d.pasi[0].grupuri[0].noduri.find((n) => n.fel === "afisaj") as NodAfisaj;
  return previzualizareaDeDesenat(d, nod, aplicaRegulile(d, reguli, normalizeazaValori(valori)));
};

/* ══════════════════════════════════════════════════════════════════════════
   CUTIA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ o zona care iese din poza se TAIE, nu se refuza", () => {
  /*
   * ⚠ In panou asta se intampla din prima incercare, tragand cu mausul. Refuzata, comerciantul ar
   * fi vazut zona disparand cu totul si n-ar fi stiut de ce; taiata, o vede la margine si o trage
   * inapoi.
   */
  const c = cutiaZonei(zona({ x: 0.9, l: 0.4 }));
  assert.equal(c.x, 0.9);
  assert.ok(Math.abs(c.l - 0.1) < 1e-9, `latimea a ramas ${c.l}`);
});

test("valorile aiurea cad pe implicite, nu pe NaN sau negativ", () => {
  for (const rau of [undefined, null, NaN, Infinity, "0.5", -3]) {
    const c = cutiaZonei(zona({ x: rau as number, l: rau as number }));
    assert.ok(c.x >= 0 && c.x <= 1, `x=${c.x} pentru ${String(rau)}`);
    assert.ok(c.l > 0 && c.l <= 1, `l=${c.l} pentru ${String(rau)}`);
  }
});

test("rotirea se margineste, ca sa nu se poata scrie 100000 de grade", () => {
  assert.equal(cutiaZonei(zona({ rotire: 900 })).rotire, 180);
  assert.equal(cutiaZonei(zona({ rotire: -900 })).rotire, -180);
});

/* ══════════════════════════════════════════════════════════════════════════
   CE SE DESENEAZA
   ══════════════════════════════════════════════════════════════════════════ */

test("textul scris de cumparator se deseneaza, cu implicite VIZIBILE", () => {
  /*
   * ⚠ Culoarea si marimea au implicite care se vad. Lasate pe `undefined`, textul ar fi mostenit
   * culoarea paginii — adica ar fi putut fi alb pe alb, iar comerciantul ar fi crezut ca
   * previzualizarea e stricata.
   */
  const ce = ceDeseneaza(text(), zona(), normalizeazaValori({ grav: { f: "text", v: "Ana" } }));
  assert.equal(ce?.fel, "text");
  if (ce?.fel !== "text") return;
  assert.equal(ce.text, "Ana");
  assert.ok(ce.culoare.startsWith("#"));
  assert.ok(ce.marime > 0);
});

test("un text GOL nu deseneaza o zona goala", () => {
  assert.equal(ceDeseneaza(text(), zona(), normalizeazaValori({ grav: { f: "text", v: "   " } })), null);
  assert.equal(ceDeseneaza(text(), zona(), normalizeazaValori({})), null);
});

test("marimea textului se plafoneaza", () => {
  // ⚠ `marime: 40` inseamna de patruzeci de ori inaltimea imaginii: o litera peste toata pagina.
  const ce = ceDeseneaza(text(), zona({ marime: 40 }), normalizeazaValori({ grav: { f: "text", v: "A" } }));
  assert.ok(ce?.fel === "text" && ce.marime <= 0.5, JSON.stringify(ce));
});

test("⚠ ESANTIONUL bate pastila de culoare", () => {
  /*
   * ⚠ O optiune poate avea si esantion, si pastila (pastila se vede in lista de alegere, esantionul
   * e textura adevarata). Pe produs se deseneaza textura: o pastila portocalie in locul lemnului de
   * cires arata a greseala, nu a lemn.
   */
  const nod = { fel: "alegere", control: "lista", id: "lemn", eticheta: "Lemn", optiuni: [
    { id: "cires", eticheta: "Cires", culoare: "#c1440e", imagine: "/cires.jpg" },
  ] } as Nod;
  const ce = ceDeseneaza(nod, zona({ nod: "lemn" }), normalizeazaValori({ lemn: { f: "alegere", v: "cires" } }));
  assert.deepEqual(ce, { fel: "imagine", imagine: "/cires.jpg" });
});

test("o optiune fara nici esantion, nici culoare, nu deseneaza nimic", () => {
  const nod = { fel: "alegere", control: "lista", id: "l", eticheta: "L", optiuni: [
    { id: "a", eticheta: "A" },
  ] } as Nod;
  assert.equal(ceDeseneaza(nod, zona({ nod: "l" }), normalizeazaValori({ l: { f: "alegere", v: "a" } })), null);
});

test("⚠ dintr-un camp de fisiere se deseneaza PRIMUL, si numai el", () => {
  /*
   * ⚠ O zona e UN loc. Doua poze in acelasi loc s-ar fi acoperit una pe alta, iar cumparatorul ar
   * fi vazut-o doar pe a doua si ar fi crezut ca prima s-a pierdut. Cine vrea doua locuri pune
   * doua zone.
   */
  const nod = { fel: "fisiere", control: "imagine", id: "poza", eticheta: "Poza" } as Nod;
  const ce = ceDeseneaza(nod, zona({ nod: "poza" }), normalizeazaValori({
    poza: { f: "fisiere", v: [{ id: "a" }, { id: "b" }] },
  }));
  assert.equal(ce?.fel, "fisier");
  assert.ok(ce?.fel === "fisier" && ce.fisierId === "a");
});

test("asezarea decupata se duce mai departe cand exista", () => {
  const nod = { fel: "fisiere", control: "imagine", id: "poza", eticheta: "Poza" } as Nod;
  const ce = ceDeseneaza(nod, zona({ nod: "poza" }), normalizeazaValori({
    poza: { f: "fisiere", v: [{ id: "a", t: { x: 0.1, y: 0.2, s: 1.5, r: 15 } }] },
  }));
  assert.deepEqual(ce, { fel: "fisier", fisierId: "a", asezare: { x: 0.1, y: 0.2, s: 1.5, r: 15 } });
});

test("⚠ numerele si comutatoarele NU se deseneaza, si asta e o hotarare", () => {
  /*
   * ⚠ „350" scris peste o cana nu inseamna nimic pentru cumparator, iar un comutator n-are ce
   * infatisa. Ce schimba forma produsului se arata prin optiunea aleasa, care are esantion.
   */
  const n = { fel: "numar", control: "camp", id: "lat", eticheta: "Latime" } as Nod;
  assert.equal(ceDeseneaza(n, zona({ nod: "lat" }), normalizeazaValori({ lat: { f: "numar", v: 350 } })), null);
});

/* ══════════════════════════════════════════════════════════════════════════
   PREVIZUALIZAREA INTREAGA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ fara imagine de fundal nu se deseneaza NIMIC", () => {
  /*
   * ⚠ Zonele sunt asezate in fractiuni DIN EA. Fara ea n-ar avea peste ce sta, si ar fi iesit un
   * teanc de cutii plutind intr-un dreptunghi gol — care arata a stricat, nu a lipsa.
   */
  const d = def([text(), previz([zona()], "")]);
  assert.equal(deDesenat(d, { grav: { f: "text", v: "Ana" } }), null);
});

test("⚠ o zona care trimite la un nod STERS se sare, nu doboara pagina", () => {
  /*
   * ⚠ Definitia poate fi scrisa de o versiune mai veche sau atinsa dintr-o consola, iar pagina de
   * produs trebuie sa se vanda mai departe. O previzualizare lipsa e o paguba mica; o pagina cazuta
   * e una mare — aceeasi regula ca in `vitrina.ts`.
   */
  const d = def([text(), previz([zona(), zona({ nod: "nu-exista" })])]);
  const p = deDesenat(d, { grav: { f: "text", v: "Ana" } });
  assert.equal(p?.zone.length, 1);
});

test("⚠ un camp ASCUNS de o regula nu mai deseneaza ce era inainte", () => {
  /*
   * ⚠ `aplicaRegulile` goleste valorile campurilor ascunse, dar zona ar fi ramas desenata daca s-ar
   * fi uitat doar la ce a trimis browserul. Cumparatorul ar fi vazut pe produs o gravura pentru care
   * nu plateste si care nu intra in comanda.
   */
  const d = def([
    text(),
    { fel: "comutator", control: "comutator", id: "fara", eticheta: "Fara gravura" } as Nod,
    previz([zona()]),
  ]);
  const reguli: Regula[] = [
    { id: "r", cand: { c: "pornit", nod: "fara" }, atunci: [{ a: "ascunde", tinta: "grav" }] },
  ];
  const p = deDesenat(d, { grav: { f: "text", v: "Ana" }, fara: { f: "comutator", v: true } }, reguli);
  assert.deepEqual(p?.zone, []);
});

test("zonele se plafoneaza la numar", () => {
  const multe = Array.from({ length: MAX_ZONE + 30 }, () => zona());
  const d = def([text(), previz(multe)]);
  const p = deDesenat(d, { grav: { f: "text", v: "Ana" } });
  assert.equal(p?.zone.length, MAX_ZONE);
});

test("nu arunca pe nimic din ce poate sta intr-o definitie", () => {
  for (const rau of [null, undefined, 7, "x", { nod: 5 }, {}]) {
    const d = def([text(), previz([rau as unknown as ZonaPreviz])]);
    assert.doesNotThrow(() => deDesenat(d, { grav: { f: "text", v: "A" } }));
  }
});

test("cheile de randare sunt unice cand acelasi nod apare de doua ori", () => {
  // Doua zone pe acelasi camp e legitim: aceeasi gravura pe fata si pe spate.
  const d = def([text(), previz([zona(), zona({ y: 0.7 })])]);
  const p = deDesenat(d, { grav: { f: "text", v: "Ana" } });
  const chei = (p?.zone ?? []).map((z) => z.cheie);
  assert.equal(new Set(chei).size, chei.length, chei.join(", "));
});

/* ══════════════════════════════════════════════════════════════════════════
   CE OFERA PANOUL
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ se ofera doar campurile care CHIAR se pot desena", () => {
  /*
   * ⚠ Un camp de numar oferit in lista l-ar fi lasat pe comerciant sa aseze o zona peste el, s-o
   * mute cu grija, sa publice — si sa nu vada nimic. Apoi ar fi cautat greseala la el.
   */
  const d = def([
    text(),
    { fel: "numar", control: "camp", id: "lat", eticheta: "L" } as Nod,
    { fel: "comutator", control: "comutator", id: "c", eticheta: "C" } as Nod,
    { fel: "fisiere", control: "imagine", id: "poza", eticheta: "P" } as Nod,
  ]);
  assert.deepEqual(nodurileCareSePotDesena(d).map((n) => n.id), ["grav", "poza"]);
});

test("⚠ se stie care campuri de fisiere sunt ASEZATE undeva", () => {
  /*
   * ⚠ DE ASTA ATARNA DECUPAREA. `FisierAles.t` inseamna asezarea imaginii INTR-O zona; fara zona,
   * cele patru numere n-au fata de ce sa fie socotite, si in comanda ar fi ajuns o instructiune pe
   * care atelierul n-o poate urma. Uneltele de asezare se arata exact cand exista zona.
   */
  const poza = { fel: "fisiere", control: "imagine", id: "poza", eticheta: "P" } as Nod;
  assert.deepEqual([...nodurileAsezateInPreviz(def([poza, previz([zona({ nod: "poza" })])]))], ["poza"]);
  // Fara imagine de fundal previzualizarea nu deseneaza nimic, deci nici nu aseaza nimic.
  assert.deepEqual([...nodurileAsezateInPreviz(def([poza, previz([zona({ nod: "poza" })], "")]))], []);
  assert.deepEqual([...nodurileAsezateInPreviz(undefined)], []);
});

test("⚠ marimea textului se muta din IMAGINE in ZONA", () => {
  /*
   * ⚠ Comerciantul scrie marimea ca fractiune din inaltimea IMAGINII — asa gandeste el. Dar pe
   * ecran litera sta intr-un element care e chiar zona, si singurul fel in care se poate scala
   * odata cu poza e o unitate de interogare pe containerul ala. Deci se imparte.
   *
   * Facuta in componenta, socoteala asta ar fi ramas neprobata — si greselile ei nu cad, doar
   * deseneaza literele de trei ori mai mari decat a cerut comerciantul.
   */
  const d = def([text(), previz([zona({ i: 0.2, marime: 0.06 })])]);
  const p = deDesenat(d, { grav: { f: "text", v: "Ana" } });
  const ce = p?.zone[0].ce;
  assert.equal(ce?.fel, "text");
  assert.ok(ce?.fel === "text" && Math.abs(ce.marime - 0.3) < 1e-9, JSON.stringify(ce));
});

test("o zona foarte joasa nu produce o litera cat toata poza", () => {
  // ⚠ `marime / i` creste cand zona se subtiaza. Fara plafon, o zona de 0,01 ar fi dat 6.
  const d = def([text(), previz([zona({ i: 0.01, marime: 0.06 })])]);
  const p = deDesenat(d, { grav: { f: "text", v: "Ana" } });
  const ce = p?.zone[0].ce;
  assert.ok(ce?.fel === "text" && ce.marime <= 1, JSON.stringify(ce));
});
