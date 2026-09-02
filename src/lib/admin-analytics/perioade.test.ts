import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PERIOADE, intervalul, intervalulDinainte, crestere, ePerioada, type NumePerioada } from "./perioade";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  O ZI GRESITA AICI FACE FIECARE PROCENT DE CRESTERE FALS
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SI NIMENI N-AR OBSERVA. Un raport care spune „+18%" arata la fel de credibil
  fie ca perioadele sunt lipite cum trebuie, fie ca se suprapun cu o zi. De aceea
  probele de mai jos nu se uita la siruri, ci NUMARA zilele si cer ca cele doua
  ferestre sa fie lipite, la fel de lungi, si sa nu se atinga.
*/

/** Cate zile in urma inseamna un sir GA4. `today` = 0. */
function inUrma(sir: string): number {
  if (sir === "today") return 0;
  if (sir === "yesterday") return 1;
  const m = sir.match(/^(\d+)daysAgo$/);
  assert.ok(m, `sir de data pe care GA4 nu-l cunoaste: "${sir}"`);
  return Number(m![1]);
}

const TOATE = Object.keys(PERIOADE) as NumePerioada[];

test("⚠ fiecare perioada are exact atatea zile cate promite", () => {
  for (const p of TOATE) {
    const { startDate, endDate } = intervalul(p);
    /* Amandoua capetele sunt INCLUSE, deci lungimea e diferenta plus unu. */
    const lungime = inUrma(startDate) - inUrma(endDate) + 1;
    assert.equal(lungime, PERIOADE[p].zile, `"${PERIOADE[p].eticheta}": ${lungime} zile in loc de ${PERIOADE[p].zile}`);
  }
});

test("⚠ 'Ieri' se termina IERI, nu azi", () => {
  /*
    ⚠ CE APARA. Formula veche putea scrie numai perioade lipite de ziua de azi.
    Adaugata fara `decalaj`, 'Ieri' ar fi iesit identica cu 'Azi' — doua butoane
    care arata acelasi lucru, si nimic care sa spuna de ce.
  */
  assert.deepEqual(intervalul("ieri"), { startDate: "yesterday", endDate: "yesterday" });
  assert.deepEqual(intervalul("azi"), { startDate: "today", endDate: "today" });
  assert.notDeepEqual(intervalul("ieri"), intervalul("azi"), "'Ieri' arata aceleasi zile ca 'Azi'");
});

test("⚠ perioada de comparat e la fel de lunga SI nu se suprapune", () => {
  for (const p of TOATE) {
    const acum = intervalul(p);
    const inainte = intervalulDinainte(p);

    const lungimeAcum = inUrma(acum.startDate) - inUrma(acum.endDate) + 1;
    const lungimeInainte = inUrma(inainte.startDate) - inUrma(inainte.endDate) + 1;
    assert.equal(lungimeInainte, lungimeAcum,
      `"${PERIOADE[p].eticheta}": se compara ${lungimeAcum} zile cu ${lungimeInainte}`);

    /*
      ⚠ CEA DE DINAINTE TREBUIE SA SE TERMINE STRICT INAINTE de inceputul celei de
      acum. Egale, o zi ar fi numarata in amandoua — si atunci fiecare crestere ar
      fi masurata fata de o perioada care se contine putin pe sine.
    */
    assert.ok(inUrma(inainte.endDate) > inUrma(acum.startDate),
      `"${PERIOADE[p].eticheta}": ferestrele se suprapun (${inainte.endDate} vs ${acum.startDate})`);

    /* Si nici sa nu lase o gaura: trebuie sa fie LIPITE. */
    assert.equal(inUrma(inainte.endDate), inUrma(acum.startDate) + 1,
      `"${PERIOADE[p].eticheta}": intre cele doua ferestre a ramas o gaura`);
  }
});

test("⚠ toate capetele sunt in trecut sau azi, niciodata in viitor", () => {
  for (const p of TOATE) {
    for (const interval of [intervalul(p), intervalulDinainte(p)]) {
      assert.ok(inUrma(interval.startDate) >= 0 && inUrma(interval.endDate) >= 0,
        `"${PERIOADE[p].eticheta}": o data in viitor`);
      assert.ok(inUrma(interval.startDate) >= inUrma(interval.endDate),
        `"${PERIOADE[p].eticheta}": inceputul e dupa sfarsit`);
    }
  }
});

test("perioadele necunoscute se resping", () => {
  for (const rau of ["", "ieri2", "AZI", "7 zile", null, undefined, "__proto__", "toString"]) {
    assert.equal(ePerioada(rau as string), false, `"${String(rau)}" a trecut ca perioada`);
  }
  for (const bun of TOATE) assert.equal(ePerioada(bun), true, `"${bun}" a fost respinsa`);
});

test("⚠ cresterea de la zero e `null`, nu zero si nici infinit", () => {
  assert.equal(crestere(12, 0), null, "'de la 0 la 12' a primit un procent");
  assert.equal(crestere(0, 0), null);
  assert.equal(crestere(12, 10), 20);
  assert.equal(crestere(8, 10), -20);
  assert.equal(crestere(Number.NaN, 10), null);
  assert.equal(crestere(10, Number.NaN), null);
});
