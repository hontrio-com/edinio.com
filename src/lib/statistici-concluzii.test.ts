import { strict as assert } from "node:assert";
import { test } from "node:test";

import { concluzii } from "./statistici-concluzii";
import { DETALIU_GOL, type CarduriSecundare, type DetaliuVanzari, type RandSursa } from "./statistici";
import type { DateVanzari } from "./vanzari";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  O concluzie scrisa cu vorbe se citeste ca un adevar, chiar cand e trasa din
  trei vizite. Probele astea apara PRAGURILE (sub cat nu se spune nimic) si
  faptul ca aceleasi cifre dau mereu acelasi raspuns, in aceeasi ordine.
*/

function sursa(x: Partial<RandSursa> = {}): RandSursa {
  return { sursa: "google", dispozitiv: "desktop", sesiuni: 0, sesiuni_cu_comanda: 0, vanzari: 0, ...x };
}

function detaliu(x: Partial<DetaliuVanzari> = {}): DetaliuVanzari {
  return { ...DETALIU_GOL, ...x, sumar: { ...DETALIU_GOL.sumar, ...x.sumar } };
}

function carduri(x: Partial<CarduriSecundare> = {}): CarduriSecundare {
  return { clienti_noi: 0, clienti_recurenti: 0, bucati: 0, anulate: 0, comenzi_toate: 0, ...x };
}

function panou(acum: number, inainte: number, comenzi = 20): DateVanzari {
  return {
    granulatie: "zi",
    interval: { de_la: "2026-09-01", pana_la: "2026-09-20" },
    interval_anterior: { de_la: "2026-08-12", pana_la: "2026-08-31" },
    serie: [], serie_anterioara: [],
    total: { vanzari: acum, comenzi },
    total_anterior: { vanzari: inainte, comenzi },
  };
}

const NIMIC = { vanzari: null, detaliu: detaliu(), secundare: null, surse: [], palnie: null };

test("fara date, nu se spune nimic", () => {
  assert.deepEqual(concluzii(NIMIC), []);
});

/* ── Pragurile ────────────────────────────────────────────────────────────── */

test("o sursa cu putine vizite si nicio comanda NU produce o concluzie", () => {
  /*
    ⚠ Asta e regula care conteaza. Cu 12 vizite si nicio comanda nu se poate
    spune nimic despre canal; propozitia ar fi sunat insa la fel de sigur ca
    una scoasa din o mie de vizite.
  */
  const c = concluzii({ ...NIMIC, surse: [sursa({ sursa: "instagram", sesiuni: 12 })] });
  assert.deepEqual(c, []);
});

test("o sursa cu multe vizite si nicio comanda e semnalata", () => {
  const c = concluzii({ ...NIMIC, surse: [sursa({ sursa: "instagram", sesiuni: 140 })] });
  assert.equal(c.length, 1);
  assert.equal(c[0].cheie, "canal-fara-comenzi");
  assert.equal(c[0].ton, "rau");
  assert.match(c[0].text, /Instagram/);
  assert.match(c[0].text, /140 de vizite/);
});

test("„de” se pune dupa ultimele doua cifre, nu dupa marimea numarului", () => {
  /*
    ⚠ „103 vizite", nu „103 de vizite". Scrisa cu „de" lipit in sablon, fraza
    era gresita romaneste la orice numar care se termina in 01-19.
  */
  const o103 = concluzii({ ...NIMIC, surse: [sursa({ sursa: "tiktok", sesiuni: 103 })] });
  assert.match(o103[0].text, /103 vizite/);
  assert.doesNotMatch(o103[0].text, /103 de/);

  const o120 = concluzii({ ...NIMIC, surse: [sursa({ sursa: "tiktok", sesiuni: 120 })] });
  assert.match(o120[0].text, /120 de vizite/);
});

test("anularile se semnaleaza doar peste 10%, si doar cu destule comenzi", () => {
  const putine = concluzii({ ...NIMIC, secundare: carduri({ anulate: 2, comenzi_toate: 6 }) });
  assert.deepEqual(putine, [], "6 comenzi sunt prea putine ca sa vorbim de o rata");

  const subPrag = concluzii({ ...NIMIC, secundare: carduri({ anulate: 1, comenzi_toate: 40 }) });
  assert.deepEqual(subPrag, [], "2,5% nu e o problema");

  /* ⚠ 9,91% (11 din 111, cat are magazinul demo) e sub prag si NU se semnaleaza:
     linia e la 10%, si e o linie, nu o parere. */
  const subLinie = concluzii({ ...NIMIC, secundare: carduri({ anulate: 11, comenzi_toate: 111 }) });
  assert.deepEqual(subLinie, []);

  const peste = concluzii({ ...NIMIC, secundare: carduri({ anulate: 15, comenzi_toate: 100 }) });
  assert.equal(peste[0].cheie, "anulari-multe");
  assert.match(peste[0].text, /15 din 100/);
});

test("cosurile parasite cer si volum, si o rata proasta", () => {
  const putine = concluzii({ ...NIMIC, palnie: { sesiuni: 100, cu_cos: 8, cu_comanda: 1 } });
  assert.deepEqual(putine, []);

  const bune = concluzii({ ...NIMIC, palnie: { sesiuni: 400, cu_cos: 80, cu_comanda: 40 } });
  assert.deepEqual(bune, [], "jumatate din cosuri ajung comenzi: nu e o problema");

  const rele = concluzii({ ...NIMIC, palnie: { sesiuni: 400, cu_cos: 78, cu_comanda: 6 } });
  assert.equal(rele[0].cheie, "cosuri-parasite");
});

test("miscarea fata de perioada precedenta se spune doar peste 20%", () => {
  assert.deepEqual(concluzii({ ...NIMIC, vanzari: panou(110, 100) }), [], "10% e zgomot");

  const sus = concluzii({ ...NIMIC, vanzari: panou(150, 100) });
  assert.equal(sus[0].cheie, "crestere");
  assert.equal(sus[0].ton, "bun");

  const jos = concluzii({ ...NIMIC, vanzari: panou(50, 100) });
  assert.equal(jos[0].cheie, "scadere");
  assert.equal(jos[0].ton, "rau");
  assert.match(jos[0].text, /scazut cu 50%/);
});

test("fara perioada precedenta nu se inventeaza o crestere", () => {
  /* ⚠ Din zero nu creste nimic cu un procent; ar fi fost „infinit la suta". */
  assert.deepEqual(concluzii({ ...NIMIC, vanzari: panou(5000, 0) }), []);
});

test("cu prea putine comenzi nu se vorbeste de crestere", () => {
  assert.deepEqual(concluzii({ ...NIMIC, vanzari: panou(500, 100, 3) }), []);
});

/* ── Ordinea si numarul ───────────────────────────────────────────────────── */

test("se arata cel mult trei, cele mai grele primele", () => {
  const c = concluzii({
    vanzari: panou(50, 100),
    secundare: carduri({ anulate: 15, comenzi_toate: 100 }),
    surse: [
      sursa({ sursa: "instagram", dispozitiv: "mobile", sesiuni: 140 }),
      sursa({ sursa: "google", dispozitiv: "desktop", sesiuni: 100, sesiuni_cu_comanda: 5 }),
    ],
    palnie: { sesiuni: 400, cu_cos: 78, cu_comanda: 6 },
    detaliu: detaliu({
      produse: [{ product_id: "p", nume: "Lampa", bucati: 8, vanzari: 900, comenzi: 7 }],
    }),
  });
  assert.equal(c.length, 3);
  assert.deepEqual(c.map((x) => x.cheie), ["canal-fara-comenzi", "cosuri-parasite", "anulari-multe"]);
});

test("aceleasi cifre dau acelasi raspuns, de fiecare data", () => {
  /*
    ⚠ Concluziile sunt deterministe. Doua surse la fel de mari nu se pot aseza
    o data intr-o ordine si o data in alta: comerciantul ar fi crezut ca s-a
    schimbat ceva in magazin, cand de fapt se schimbase doar ordinea din raspuns.
  */
  const intrare = {
    ...NIMIC,
    surse: [
      sursa({ sursa: "tiktok", sesiuni: 60 }),
      sursa({ sursa: "instagram", sesiuni: 60 }),
    ],
  };
  const intai = concluzii(intrare);
  const apoi = concluzii({ ...intrare, surse: [...intrare.surse].reverse() });
  assert.deepEqual(intai, apoi);
});

test("un produs care duce sfertul din vanzari e semnalat, unul mic nu", () => {
  const mare = concluzii({
    ...NIMIC,
    detaliu: detaliu({
      produse: [
        { product_id: "a", nume: "Lampa Arc", bucati: 8, vanzari: 800, comenzi: 7 },
        { product_id: "b", nume: "Pled", bucati: 5, vanzari: 200, comenzi: 5 },
      ],
    }),
  });
  assert.equal(mare[0].cheie, "produs-purtator");
  assert.match(mare[0].text, /Lampa Arc/);
  assert.match(mare[0].text, /80%/);

  const mic = concluzii({
    ...NIMIC,
    detaliu: detaliu({
      produse: [
        { product_id: "a", nume: "Lampa Arc", bucati: 8, vanzari: 100, comenzi: 7 },
        { product_id: "b", nume: "Pled", bucati: 5, vanzari: 900, comenzi: 5 },
      ],
    }),
  });
  assert.deepEqual(mic, [], "varful listei nu e cel mai mare: nu se spune nimic");
});
