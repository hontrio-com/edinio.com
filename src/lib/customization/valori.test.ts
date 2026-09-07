import test from "node:test";
import assert from "node:assert/strict";
import { normalizeazaDefinitia, type DefinitiePersonalizare } from "./definitie";
import {
  FISIERE_IMPLICIT, MAX_FISIERE, fisiereleCampului, normalizeazaValorile,
} from "./valori";

/**
 * Ce trimite clientul, curatat.
 *
 * ⚠ PROBELE ASTEA SUNT O POARTA DE BANI, nu una de politete. Valorile vin dintr-un formular
 * public, de la un vizitator fara cont, si pe drumul comenzii ele hotarasc un PRET. Fiecare
 * verificare de aici e ultimul lucru dintre browser si factura.
 */

function def(campuri: unknown[]): DefinitiePersonalizare {
  const d = normalizeazaDefinitia({ enabled: true, fields: campuri });
  assert.ok(d, "definitia de proba nu s-a citit");
  return d;
}

const DIM = {
  id: "d", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
  latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 },
};

const BUT = {
  id: "b", type: "butoane", label: "Material", required: true,
  optiuni: [{ id: "std", eticheta: "Standard" }, { id: "prm", eticheta: "Premium" }],
};

test("⚠ un camp OBLIGATORIU gol opreste totul", () => {
  const d = def([{ id: "t", type: "text", label: "Gravura", required: true }]);
  const r = normalizeazaValorile(d, {});
  assert.equal(r.ok, false);
  assert.equal(r.constatari.length, 1);
  assert.equal(r.constatari[0].campId, "t");
  assert.equal(r.valori.has("t"), false);

  /* Si spatiile albe nu tin loc de raspuns. */
  assert.equal(normalizeazaValorile(d, { t: "   " }).ok, false);
});

test("⚠ un camp NEobligatoriu gol nu e o problema, si nici o valoare", () => {
  const d = def([{ id: "t", type: "text", label: "Gravura", required: false }]);
  const r = normalizeazaValorile(d, { t: "" });
  assert.equal(r.ok, true);
  assert.equal(r.valori.has("t"), false);
});

test("⚠ optiunea trebuie sa fie DIN LISTA", () => {
  /*
   * Fara verificarea asta, un client putea trimite orice text si el ajungea in comanda ca alegere
   * „legitima" — iar la un camp cu pret ar fi fost o alegere fara pret, adica marfa Premium la
   * pretul Standard.
   */
  const d = def([BUT]);
  assert.equal(normalizeazaValorile(d, { b: "prm" }).ok, true);
  const rea = normalizeazaValorile(d, { b: "inventat" });
  assert.equal(rea.ok, false);
  assert.match(rea.constatari[0].mesaj, /nu exista/i);
  assert.equal(rea.valori.has("b"), false);
});

test("⚠ `select`-ul vechi se valideaza pe ID, nu pe eticheta", () => {
  /*
   * ═══ ⚠ PROBA S-A INTORS PE 07.09.2026 ═══
   *
   * Ea cerea `{ s: "M" }` — eticheta — fiindca la `select`-ul vechi eticheta ERA identitatea. Chiar
   * asta era defectul tipului: o corectura de scriere („Premim" -> „Premium") facea optiunea sa
   * para alta, si tocmai de aceea pretul n-avea de ce sa atarne.
   *
   * De cand `select` se converteste in `butoane` cu stilul „lista", alegerea se potriveste dupa
   * `id`, ca peste tot in restul sistemului.
   *
   * ⚠ SI CE INSEAMNA ASTA PENTRU O LINIE VECHE DIN COS: una salvata cu eticheta („M") nu mai
   * valideaza. Nu e o pierdere tacuta — chiar asta aprinde `cereRevizuire`, deci cosul scrie
   * „Necesita actualizare — apasa «Editeaza»" si omul isi reface alegerea in doua apasari. Iar in
   * baza nu exista niciun asemenea camp: masurat pe 07.09.2026, 0 selecturi din 32 de produse
   * personalizabile.
   */
  const d = def([{ id: "s", type: "select", label: "Marime", required: true, options: ["S", "M"] }]);
  assert.equal(normalizeazaValorile(d, { s: "m" }).ok, true, "id-ul optiunii n-a fost primit");
  assert.equal(normalizeazaValorile(d, { s: "M" }).ok, false, "eticheta a trecut drept identitate");
  assert.equal(normalizeazaValorile(d, { s: "XXL" }).ok, false);
});

test("⚠ dimensiunile in afara marginilor se REFUZA, cu mesajul limitelor", () => {
  const d = def([DIM]);
  assert.equal(normalizeazaValorile(d, { d: { latime: 350, inaltime: 250 } }).ok, true);

  const subMin = normalizeazaValorile(d, { d: { latime: 50, inaltime: 250 } });
  assert.equal(subMin.ok, false);
  assert.match(subMin.constatari[0].mesaj, /intre 100 si 500 cm/);

  const pesteMax = normalizeazaValorile(d, { d: { latime: 350, inaltime: 900 } });
  assert.equal(pesteMax.ok, false);
  assert.match(pesteMax.constatari[0].mesaj, /intre 70 si 350 cm/);
});

test("⚠ NaN, Infinity si negativele nu trec nicaieri", () => {
  /*
   * Toate trei arata ca „un numar" pentru o verificare naiva, si toate trei ar fi dus un pret
   * intr-un loc din care nu se mai intoarce: `NaN` inghitit de `round2` devine 0 (marfa pe
   * gratis), `Infinity` rupe fiecare socoteala de dupa el.
   */
  const d = def([DIM, { id: "n", type: "numar", label: "Bucati", required: true, min: 1, max: 10 }]);
  for (const rau of [NaN, Infinity, -Infinity, -5, "abc", null, undefined, {}, []]) {
    const r = normalizeazaValorile(d, { d: { latime: rau, inaltime: 250 }, n: rau });
    assert.equal(r.ok, false, `a trecut: ${String(rau)}`);
    assert.equal(r.valori.has("d"), false);
    assert.equal(r.valori.has("n"), false);
  }
});

test("⚠ plafonul absolut tine si cand comerciantul n-a pus margini", () => {
  /*
   * Un camp de dimensiuni lasat nemarginit ar fi primit din browser o latime de un milion, iar
   * suprafata ar fi iesit un numar pe care nicio alta socoteala din platforma nu-l mai poate purta.
   */
  const d = def([{ id: "d", type: "dimensiuni", label: "D", required: true, unitate: "cm" }]);
  assert.equal(normalizeazaValorile(d, { d: { latime: 1000, inaltime: 1000 } }).ok, true, "10x10 m e legitim");
  const urias = normalizeazaValorile(d, { d: { latime: 1_000_000, inaltime: 100 } });
  assert.equal(urias.ok, false);
  assert.match(urias.constatari[0].mesaj, /depaseste 100 m/);
});

test("⚠ textul peste limita se refuza, nu se taie tacut", () => {
  /*
   * Taiat, clientul ar fi comandat o gravura pe care a scris-o intreaga si ar fi primit-o pe
   * jumatate — iar comerciantul ar fi produs-o gresit fara sa stie de ce.
   */
  const d = def([{ id: "t", type: "text", label: "Gravura", required: true, max_length: 10 }]);
  assert.equal(normalizeazaValorile(d, { t: "Robert" }).ok, true);
  const lung = normalizeazaValorile(d, { t: "Robert si Maria si inca cineva" });
  assert.equal(lung.ok, false);
  assert.match(lung.constatari[0].mesaj, /cel mult 10 caractere/);
});

test("⚠ un comutator STINS e un raspuns, nu o lipsa", () => {
  /*
   * Altfel „Adaug protectie impermeabila?" n-ar fi putut fi obligatoriu si sa primeasca totusi
   * raspunsul „nu".
   */
  const d = def([{ id: "c", type: "comutator", label: "Protectie", required: true }]);
  const r = normalizeazaValorile(d, { c: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.valori.get("c"), { fel: "pornit", pornit: false });
  assert.deepEqual(normalizeazaValorile(d, {}).valori.get("c"), { fel: "pornit", pornit: false });
  assert.deepEqual(normalizeazaValorile(d, { c: true }).valori.get("c"), { fel: "pornit", pornit: true });
});

test("⚠ se merge pe CAMPURILE DEFINITIEI, nu pe cheile trimise de client", () => {
  /*
   * Invers, un client ar fi putut trimite chei inventate si ele ar fi ajuns in comanda ca
   * „personalizare" — iar comerciantul ar fi citit din ecranul lui date pe care nu le-a cerut
   * nimeni, cu etichete scrise tot de client.
   */
  const d = def([{ id: "t", type: "text", label: "Gravura", required: false }]);
  const r = normalizeazaValorile(d, {
    t: "Robert",
    inventat: "date care n-au ce cauta aici",
    __proto__: { rau: true },
  });
  assert.equal(r.ok, true);
  assert.equal(r.valori.size, 1);
  assert.equal(r.valori.has("inventat"), false);
});

test("⚠ pasul se verifica, ca sa nu iasa dimensiuni pe care atelierul nu le poate taia", () => {
  const d = def([{ id: "n", type: "numar", label: "Latime", required: true, min: 10, max: 100, pas: 5 }]);
  assert.equal(normalizeazaValorile(d, { n: 25 }).ok, true);
  const gresit = normalizeazaValorile(d, { n: 27 });
  assert.equal(gresit.ok, false);
  assert.match(gresit.constatari[0].mesaj, /din 5 in 5/);
});

test("⚠ fisierele peste plafon SE SPUN, nu se taie in tacere", () => {
  /*
   * ⚠ PROBA ASTA INGHETASE TAIEREA TACUTA, si merita scris limpede ce apara acum.
   *
   * Ea cerea `ok: true` si doua adrese pastrate din patru trimise — adica exact purtarea care
   * facea posibila SINGURA cale din tot sistemul prin care o comanda iese REUSITA cu date lipsa.
   *
   * Masurat pe drumul intreg, inainte de reparatie: comerciantul scrie 50 la „Fisiere max"
   * (panoul il lasa), clientul incarca 50 de poze, le vede pe toate 50 pe ecran SI in rezumatul
   * comenzii, apasa „Comanda" — iar serverul pastra 20, cu `ok: true` si `constatari: []`.
   * Albumul se producea din 20 de poze, si nu afla nimeni: nici clientul, care vazuse 50, nici
   * comerciantul, care vede 20 in panou si crede ca atat s-a incarcat.
   *
   * ⚠ O taiere care nu se spune nu e o plafonare, e o pierdere de date cu confirmare.
   */
  const d = def([{ id: "i", type: "image", label: "Poza", required: true, max_files: 2 }]);
  assert.equal(normalizeazaValorile(d, { i: [] }).ok, false);
  assert.equal(normalizeazaValorile(d, { i: "nu-i tablou" }).ok, false);

  const r = normalizeazaValorile(d, { i: ["a", "b", "c", "d"] });
  assert.equal(r.ok, false, "patru fisiere pe un camp de doua au trecut in tacere");
  assert.match(r.constatari[0].mesaj, /cel mult 2/);
  assert.match(r.constatari[0].mesaj, /ai incarcat 4/);

  /* Perechea: exact cate incap trec, si toate se pastreaza. */
  const bun = normalizeazaValorile(d, { i: ["a", "b"] });
  assert.equal(bun.ok, true);
  const v = bun.valori.get("i");
  assert.equal(v?.fel === "fisiere" && v.adrese.length, 2);
});

test("⚠ plafonul NOSTRU sta peste cel al comerciantului", () => {
  /*
   * Comerciantul putea scrie 50, iar panoul il lasa. `fisiereleCampului` pune plafonul platformei
   * deasupra, si e o singura functie — folosita si de vitrina (cate se pot alege), si de validare
   * (cate se accepta). Doua cifre ar fi insemnat un ecran care promite mai mult decat se ia.
   */
  const d = def([{ id: "i", type: "image", label: "Poza", required: true, max_files: 50 }]);
  assert.equal(fisiereleCampului(d.fields[0]), MAX_FISIERE);

  const multe = Array.from({ length: MAX_FISIERE + 1 }, (_, i) => `a${i}`);
  const r = normalizeazaValorile(d, { i: multe });
  assert.equal(r.ok, false, "s-a trecut peste plafonul platformei");
  assert.match(r.constatari[0].mesaj, new RegExp(`cel mult ${MAX_FISIERE}`));

  /* Si fara nicio cerere a comerciantului, implicitul e cel de azi. */
  const implicit = def([{ id: "i", type: "image", label: "Poza", required: true }]);
  assert.equal(fisiereleCampului(implicit.fields[0]), FISIERE_IMPLICIT);
});

test("⚠ culoarea trebuie sa fie chiar o culoare", () => {
  const d = def([{ id: "c", type: "color", label: "Culoare", required: true }]);
  assert.equal(normalizeazaValorile(d, { c: "#1AB554" }).ok, true);
  assert.equal(normalizeazaValorile(d, { c: "rosu" }).ok, false);
  assert.equal(normalizeazaValorile(d, { c: "javascript:alert(1)" }).ok, false);
});

test("⚠ se aduna TOATE constatarile, nu se opreste la prima", () => {
  /* Altfel clientul repara un camp, apasa iar, si afla de al doilea — pe rand, la nesfarsit. */
  const d = def([
    { id: "a", type: "text", label: "A", required: true },
    { id: "b", type: "text", label: "B", required: true },
    DIM,
  ]);
  const r = normalizeazaValorile(d, {});
  assert.equal(r.ok, false);
  assert.ok(r.constatari.length >= 3, `doar ${r.constatari.length} constatari`);
});
