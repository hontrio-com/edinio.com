import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  citesteCarduriSecundare, citesteDetaliuVanzari, rataAnulare, rataConversieSesiuni,
  type CarduriSecundare,
} from "./statistici";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Socoteala sta in baza (`vanzari_detaliu`, `carduri_secundare`). In JavaScript
  raman doua feluri de lucruri care se pot strica TACUT:

  1. Impartirile care au un numitor gresit sau un zero. Ele nu dau nicio eroare,
     doar un procent care arata verosimil si e fals.
  2. Citirea raspunsurilor. Vin ca `Json`, adica „orice"; o forma neasteptata
     trebuie sa dea o valoare goala, nu sa arunce in fata comerciantului.

  Probele nu ingheata cifrele demo; fiecare apara o regula.
*/

function carduri(x: Partial<CarduriSecundare> = {}): CarduriSecundare {
  return { clienti_noi: 0, clienti_recurenti: 0, bucati: 0, anulate: 0, comenzi_toate: 0, ...x };
}

/* ── Rata de anulare ──────────────────────────────────────────────────────── */

test("rata de anulare se imparte la TOATE comenzile, anulatele incluse", () => {
  /*
    ⚠ Regula, nu cablarea: 10 comenzi intrate din care 5 anulate inseamna 50%.
    Impartit la cele ramase (5), ar fi dat 100% - un magazin normal ar fi aratat
    ca pierde totul.
  */
  assert.equal(rataAnulare(carduri({ anulate: 5, comenzi_toate: 10 })), 50);
});

test("fara nicio comanda, rata de anulare e `null`, nu zero", () => {
  /*
    „0%" spune „au intrat comenzi si n-a picat niciuna". Cand n-a intrat
    niciuna, asta e o afirmatie pe care n-o putem face.
  */
  assert.equal(rataAnulare(carduri({ anulate: 0, comenzi_toate: 0 })), null);
});

test("cand toate comenzile au fost anulate, rata e 100%", () => {
  assert.equal(rataAnulare(carduri({ anulate: 7, comenzi_toate: 7 })), 100);
});

test("rata de conversie se imparte la sesiuni, si e `null` fara ele", () => {
  const t = { vizitatori: 0, sesiuni: 200, afisari: 800, sesiuni_cu_comanda: 5 };
  assert.equal(rataConversieSesiuni(t), 2.5);
  assert.equal(rataConversieSesiuni({ ...t, sesiuni: 0, sesiuni_cu_comanda: 0 }), null);
});

/* ── Citirea raspunsurilor ────────────────────────────────────────────────── */

test("un raspuns care nu e obiect nu se citeste, dar nici nu arunca", () => {
  for (const brut of [null, undefined, 7, "ceva", true]) {
    assert.equal(citesteDetaliuVanzari(brut), null, `pentru ${String(brut)}`);
  }
});

test("tabelele lipsa din raspuns devin liste goale, nu `undefined`", () => {
  /*
    ⚠ Un `undefined` ajuns la `.map` pe ecran cade in fata comerciantului. Baza
    intoarce mereu cele patru chei, dar ecranul nu se poate sprijini pe asta:
    o functie inlocuita pe jumatate la migrare le-ar putea scapa.
  */
  const d = citesteDetaliuVanzari({ sumar: { vanzari: 12.5, comenzi: 2 } });
  assert.ok(d);
  assert.deepEqual(d.produse, []);
  assert.deepEqual(d.categorii, []);
  assert.deepEqual(d.canale, []);
  assert.deepEqual(d.statusuri, []);
  assert.equal(d.sumar.vanzari, 12.5);
  assert.equal(d.sumar.comenzi, 2);
  /* Campurile care lipsesc din `sumar` sunt zero, nu `NaN`. */
  assert.equal(d.sumar.tva, 0);
  assert.equal(d.sumar.pierdute, 0);
});

test("sumele venite ca text se citesc ca numere", () => {
  /*
    ⚠ `numeric` din Postgres soseste uneori ca sir („34864.17"). Lasat asa,
    „+" l-ar fi lipit in loc sa-l adune, iar totalurile de pe ecran ar fi fost
    concatenari, nu sume.
  */
  const d = citesteDetaliuVanzari({
    sumar: { vanzari: "34864.17" },
    produse: [{ product_id: "p1", nume: "Ceva", bucati: "3", vanzari: "99.5", comenzi: "2" }],
  });
  assert.ok(d);
  assert.equal(d.sumar.vanzari, 34864.17);
  assert.equal(d.produse[0].bucati, 3);
  assert.equal(d.produse[0].vanzari, 99.5);
  assert.equal(d.produse[0].comenzi, 2);
});

test("un produs fara identificator ramane citibil, fara identificator", () => {
  /* Linia unei comenzi vechi poate sa nu poarte `product_id`; numele ei tot
     trebuie sa apara in tabel, doar ca fara legatura catre produs. */
  const d = citesteDetaliuVanzari({ produse: [{ nume: "Produs sters", bucati: 1, vanzari: 10, comenzi: 1 }] });
  assert.equal(d?.produse[0].product_id, null);
  assert.equal(d?.produse[0].nume, "Produs sters");
});

test("cardurile secundare intorc mereu amandoua ferestrele", () => {
  /*
    ⚠ O fereastra lipsa ar fi lasat `undefined` acolo unde raspunsul e „zero",
    iar cardul ar fi aratat o crestere socotita din nimic.
  */
  const c = citesteCarduriSecundare({ acum: { clienti_noi: 4, comenzi_toate: 9, anulate: 1 } });
  assert.equal(c.acum.clienti_noi, 4);
  assert.equal(c.acum.clienti_recurenti, 0);
  assert.equal(c.inainte.clienti_noi, 0);
  assert.equal(c.inainte.comenzi_toate, 0);
  assert.equal(rataAnulare(c.inainte), null);
});

test("un raspuns gol al cardurilor nu arunca", () => {
  for (const brut of [null, undefined, {}, "ceva"]) {
    const c = citesteCarduriSecundare(brut);
    assert.equal(c.acum.clienti_noi, 0);
    assert.equal(c.inainte.bucati, 0);
  }
});
