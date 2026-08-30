import assert from "node:assert/strict";
import { test } from "node:test";
import { isDue, type StockFeedSource } from "./sources";

/*
 * Cand e scadenta o sursa.
 *
 * Regula traieste in cod, nu in SQL, si nu se vede nicaieri pe ecran: daca
 * greseste, feedul pur si simplu nu ruleaza cand trebuie, iar comerciantul nu
 * are de unde afla. De aceea are probe proprii.
 */

function sursa(over: Partial<StockFeedSource> = {}): StockFeedSource {
  return {
    id: "s1",
    business_id: "b1",
    user_id: "u1",
    name: "Furnizor",
    url: "https://furnizor.ro/stoc.csv",
    mapping: {},
    options: { match_key: "sku_auto", update_price: false },
    enabled: true,
    frequency: "daily",
    run_hour: 4,
    last_run_at: null,
    last_status: null,
    last_error: null,
    last_totals: null,
    last_import_id: null,
    consecutive_failures: 0,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

const laOra = (zi: number, ora: number) => new Date(Date.UTC(2026, 7, zi, ora, 30));

test("o sursa oprita nu e niciodata scadenta", () => {
  assert.equal(isDue(sursa({ enabled: false }), laOra(2, 4)), false);
});

test("o sursa care n-a rulat niciodata e scadenta imediat", () => {
  assert.equal(isDue(sursa({ last_run_at: null }), laOra(1, 13)), true);
});

test("orara: 55 de minute, nu 60 fix", () => {
  /* Cronul nu bate la secunda; la 60 fix o rulare ar fi sarita in fiecare ora in
     care cronul intarzie putin. */
  const s = sursa({ frequency: "hourly", last_run_at: new Date(Date.UTC(2026, 7, 1, 10, 0)).toISOString() });
  assert.equal(isDue(s, new Date(Date.UTC(2026, 7, 1, 10, 50))), false);
  assert.equal(isDue(s, new Date(Date.UTC(2026, 7, 1, 10, 56))), true);
});

test("zilnica: nu ruleaza inainte de ora ei", () => {
  const s = sursa({ run_hour: 4, last_run_at: laOra(1, 4).toISOString() });
  assert.equal(isDue(s, laOra(2, 3)), false, "ora 3 e inainte de 4");
  assert.equal(isDue(s, laOra(2, 4)), true);
});

test("zilnica: dupa ora ei se poate RECUPERA, nu se pierde ziua", () => {
  /*
   * Conditia veche era „exact la ora ei", deci o singura fereastra de o ora pe
   * zi: un cron intarziat de platforma, o livrare in curs sau bugetul turei
   * epuizat insemnau o zi intreaga sarita, fara nicio urma nicaieri.
   */
  const s = sursa({ run_hour: 4, last_run_at: laOra(1, 4).toISOString() });
  assert.equal(isDue(s, laOra(2, 11)), true, "a trecut ora ei, dar tot e scadenta");
  assert.equal(isDue(s, laOra(2, 23)), true);
});

test("zilnica: o singura data pe ZI, oricat de tarziu ar fi rulat", () => {
  /* Fara ancorarea pe zi calendaristica, pragul de 23 de ore lasa sursa sa se
     plimbe cate o ora mai devreme in fiecare zi. */
  const s = sursa({ run_hour: 4, last_run_at: laOra(2, 11).toISOString() });
  assert.equal(isDue(s, laOra(2, 23)), false, "a rulat deja azi");
  assert.equal(isDue(s, laOra(3, 4)), true, "maine, la ora ei");
});

test("ora 00:00 nu se mai plimba inapoi cate o ora pe zi", () => {
  /*
   * Masurat pe cod real inainte de ancorarea pe zi: o sursa cu `run_hour = 0`
   * rula la 23:00, apoi 22:00, apoi 21:00 — fiindca `getUTCHours() < 0` nu e
   * adevarat niciodata, deci ora ceruta n-o mai tinea in loc. In cateva zile
   * ajungea sa citeasca feedul in mijlocul zilei de lucru a furnizorului.
   */
  let ultima = laOra(1, 0);
  for (let zi = 0; zi < 4; zi++) {
    let candARulat: Date | null = null;
    for (let t = 1; t <= 48; t++) {
      const acum = new Date(ultima.getTime() + t * 3_600_000);
      if (isDue(sursa({ run_hour: 0, last_run_at: ultima.toISOString() }), acum)) {
        candARulat = acum;
        break;
      }
    }
    assert.ok(candARulat, "trebuie sa ruleze in urmatoarele 48 de ore");
    assert.equal(candARulat.getUTCHours(), 0, `ziua ${zi + 1} a fugit de la ora 0`);
    ultima = candARulat;
  }
});

test("peste 25 de ore se recupereaza la ORICE ora", () => {
  /* A sarit deja o zi; a astepta pana la ora ei ar insemna inca una. */
  const s = sursa({ run_hour: 23, last_run_at: laOra(1, 23).toISOString() });
  assert.equal(isDue(s, laOra(3, 2)), true);
});
