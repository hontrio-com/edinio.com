import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  citesteDateVanzari, crestere, etichetaBucata, etichetaComparatie, numaraZile,
  randuriGrafic, valoare, valoareTotal,
  type DateVanzari,
} from "./vanzari";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Socoteala vanzarilor se face in baza (`vanzari_panou`). In JavaScript raman doar
  cele cateva lucruri care se pot strica TACUT, fara sa dea nicio eroare si fara
  sa se vada pe ecran ca sunt gresite: un procent inventat, o medie a mediilor, o
  zi mutata de fus, o bucata lipsa desenata ca zero.

  Probele nu ingheata cifrele demo; fiecare apara o regula, si cade daca regula
  se schimba.
*/

function panou(x: Partial<DateVanzari> = {}): DateVanzari {
  return {
    granulatie: "zi",
    interval: { de_la: "2026-09-14", pana_la: "2026-09-20" },
    interval_anterior: { de_la: "2026-09-07", pana_la: "2026-09-13" },
    serie: [],
    serie_anterioara: [],
    total: { vanzari: 0, comenzi: 0 },
    total_anterior: { vanzari: 0, comenzi: 0 },
    ...x,
  };
}

test("fara vanzari in perioada precedenta, cresterea e necunoscuta, nu +100%", () => {
  assert.equal(crestere(1200, 0), null);
  /* ⚠ Regula: dintr-o luna fara nicio vanzare in una cu 1200 lei nu exista o
     crestere procentuala. Un „+100%" ar fi o cifra pe care nimeni n-a
     masurat-o, si ar arata la fel ca o dublare adevarata. */
  assert.equal(crestere(0, 0), null);
  assert.equal(crestere(150, 100), 50);
  assert.equal(crestere(50, 100), -50);
});

test("valoarea medie se ia din SUME, nu ca medie a mediilor pe zile", () => {
  /*
    O zi cu o comanda de 1000 lei si o zi cu zece comenzi de 100 lei.
    Media adevarata: 1100 lei / 11 comenzi = 100 lei.
    Media mediilor:  (1000 + 100) / 2      = 550 lei — de cinci ori mai mare.
  */
  const d = panou({
    serie: [
      { bucata: "2026-09-14", vanzari: 1000, comenzi: 1 },
      { bucata: "2026-09-15", vanzari: 1000, comenzi: 10 },
    ],
    total: { vanzari: 2000, comenzi: 11 },
  });

  const mediaMediilor =
    d.serie.reduce((s, p) => s + valoare(p, "medie"), 0) / d.serie.length;

  assert.equal(valoareTotal(d.total, "medie"), 2000 / 11);
  assert.notEqual(Math.round(valoareTotal(d.total, "medie")), Math.round(mediaMediilor));
});

test("o bucata fara comenzi nu da NaN si nici Infinity", () => {
  const goala = { bucata: "2026-09-14", vanzari: 0, comenzi: 0 };
  assert.equal(valoare(goala, "medie"), 0);
  assert.equal(valoareTotal({ vanzari: 0, comenzi: 0 }, "medie"), 0);
});

test("cele doua perioade se suprapun pe POZITIE, iar bucata lipsa ramane null", () => {
  const d = panou({
    serie: [
      { bucata: "2026-09-14", vanzari: 10, comenzi: 1 },
      { bucata: "2026-09-15", vanzari: 20, comenzi: 2 },
    ],
    serie_anterioara: [
      { bucata: "2026-09-07", vanzari: 5, comenzi: 1 },
      { bucata: "2026-09-08", vanzari: 6, comenzi: 1 },
      { bucata: "2026-09-09", vanzari: 7, comenzi: 1 },
    ],
  });

  const r = randuriGrafic(d, "vanzari", true);
  assert.equal(r.length, 3, "randurile se intind cat cea mai lunga serie");
  assert.deepEqual([r[0].acum, r[0].inainte], [10, 5]);
  assert.deepEqual([r[1].acum, r[1].inainte], [20, 6]);
  /* ⚠ `null`, nu `0`: un zero ar desena o cadere la podea care nu s-a
     intamplat, doar fiindca perioada aleasa are cu o zi mai putin. */
  assert.equal(r[2].acum, null);
  assert.equal(r[2].inainte, 7);
});

test("cu comparatia stinsa, perioada precedenta nu ajunge deloc in grafic", () => {
  const d = panou({
    serie: [{ bucata: "2026-09-14", vanzari: 10, comenzi: 1 }],
    serie_anterioara: [
      { bucata: "2026-09-07", vanzari: 5, comenzi: 1 },
      { bucata: "2026-09-08", vanzari: 6, comenzi: 1 },
    ],
  });

  const r = randuriGrafic(d, "vanzari", false);
  assert.equal(r.length, 1, "seria precedenta nu are voie sa lungeasca graficul");
  assert.equal(r[0].inainte, null);
  assert.equal(r[0].isoInainte, null);
});

test("eticheta zilei arata CHIAR ziua ei, oricare ar fi fusul", () => {
  /* ⚠ `new Date("2026-09-14")` inseamna miezul noptii UTC, care in fusele de la
     apus cade in 13 septembrie; eticheta ar fi aratat atunci cu o zi inaintea
     cifrei pe care o poarta. Citita la amiaza, ziua nu se mai poate muta. */
  assert.match(etichetaBucata("2026-09-14", "zi"), /14/);
  assert.match(etichetaBucata("2026-01-01", "zi"), /1/);
  assert.match(etichetaBucata("2026-01-01", "luna"), /ian/i);
});

test("zilele se numara INCLUSIV la amandoua capetele", () => {
  assert.equal(numaraZile({ de_la: "2026-09-14", pana_la: "2026-09-20" }), 7);
  assert.equal(numaraZile({ de_la: "2026-09-14", pana_la: "2026-09-14" }), 1);
  /* Trecerea la ora de iarna (25.10.2026) nu are voie sa scurteze luna. */
  assert.equal(numaraZile({ de_la: "2026-10-01", pana_la: "2026-10-31" }), 31);
});

test("comparatia isi spune pe nume, altfel la fiecare fel de perioada", () => {
  const d = panou();
  assert.equal(etichetaComparatie("7z", d), "ultimele 7 zile vs. cele 7 zile anterioare");
  assert.match(etichetaComparatie("luna", d), /luna trecuta/);
  assert.match(etichetaComparatie("an", d), /anul trecut/);
});

test("un raspuns de alta forma da null, nu o cadere in browser", () => {
  /* ⚠ Raspunsul functiei din baza vine ca „orice". Fara citirea asta, un `as`
     ar fi trecut de TypeScript si ar fi cazut abia in fata comerciantului, la
     primul `.map` peste ceva care nu e tablou. */
  assert.equal(citesteDateVanzari(null), null);
  assert.equal(citesteDateVanzari("eroare"), null);
  assert.equal(citesteDateVanzari({ serie: [] }), null, "fara intervale nu e un raspuns intreg");
  assert.equal(
    citesteDateVanzari({ ...panou(), serie: "nu-i tablou" }),
    null,
  );
  assert.equal(
    citesteDateVanzari({ ...panou(), granulatie: "trimestru" }),
    null,
    "o granulatie necunoscuta nu se poate desena",
  );
});

test("numerele venite ca text din baza se citesc tot ca numere", () => {
  /* `numeric` poate ajunge la noi ca sir; adunate asa, „10" + „20" ar fi facut
     „1020". */
  const citit = citesteDateVanzari({
    ...panou(),
    serie: [{ bucata: "2026-09-14", vanzari: "10.50", comenzi: "2" }],
    total: { vanzari: "10.50", comenzi: "2" },
  });
  assert.ok(citit);
  assert.equal(citit.serie[0].vanzari, 10.5);
  assert.equal(citit.total.comenzi, 2);
});
