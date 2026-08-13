import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CARDURI_PERFORMANTA,
  CULORI_SCOR,
  PRAG_BUN,
  SCORURI_PAGESPEED,
  culoareScor,
} from "./optimizare";

/*
 * Ce se probeaza aici: numerele si culorile panoului de scoruri.
 *
 * Arcul care le urca NU mai e al nostru — e in componenta trimisa de client
 * (`components/ui/gauge-1.tsx`), pastrata cum a venit, cu framer-motion cu tot.
 * Deci nu se probeaza de aici.
 */

test("scorurile arătate sunt cele cerute: toate peste 90, deci toate verzi", () => {
  /*
    Clientul a cerut „toate peste 90". Proba tine cererea in loc si dupa ce cineva
    inlocuieste numerele cu o masuratoare adevarata — atunci ori masuratoarea da
    peste 90, ori se schimba afirmatia, nu se schimba proba.
  */
  for (const { eticheta, scor } of SCORURI_PAGESPEED) {
    assert.ok(scor > 90, `${eticheta}: ${scor}, sub pragul cerut`);
    assert.ok(scor <= 100, `${eticheta}: ${scor}, peste maximul uneltei`);
    assert.equal(culoareScor(scor), CULORI_SCOR.bun, `${eticheta} nu iese verde`);
  }
  assert.equal(SCORURI_PAGESPEED.length, 4, "unealta arata exact patru scoruri");
});

test("toate scorurile cad în aceeași treaptă de culoare", () => {
  /*
    ⚠ NU e o coincidenta pe care o notam, e o PAZA.

    Componenta clientului isi scrie degradeul cu un `id` fix, „primaryGradient".
    Sunt patru cadrane in aceeasi pagina, deci patru elemente cu acelasi `id`, iar
    `url(#primaryGradient)` il ia mereu pe PRIMUL. Cat timp toate patru au aceeasi
    culoare, nu se vede nimic. In clipa in care un scor coboara sub 90 si ar trebui
    sa iasa portocaliu, inelul lui ar ramane verde — mintind exact acolo unde
    unealta adevarata nu minte.

    Componenta se pastreaza cum a venit, deci nu se repara acolo. Proba asta cade
    in schimb chiar la modificarea care ar declansa defectul, si spune de ce.
  */
  const culori = new Set(SCORURI_PAGESPEED.map((s) => culoareScor(s.scor)));
  assert.equal(
    culori.size,
    1,
    "scoruri din trepte de culoare diferite: degradeul componentei are `id` fix și toate patru ar lua culoarea primului",
  );
});

test("culoarea urmează pragurile uneltei, nu e scrisă de mână", () => {
  assert.equal(culoareScor(PRAG_BUN), CULORI_SCOR.bun);
  assert.equal(culoareScor(PRAG_BUN - 1), CULORI_SCOR.mediu);
  assert.equal(culoareScor(49), CULORI_SCOR.slab);
});

test("cardurile secțiunii au tot ce le trebuie", () => {
  const vazute = new Set<string>();
  for (const card of CARDURI_PERFORMANTA) {
    assert.equal(vazute.has(card.id), false, `${card.id} apare de două ori`);
    vazute.add(card.id);
    assert.ok(card.titlu.length > 0);
    assert.ok(card.descriere.length > 30, `${card.id}: descriere prea scurtă`);
  }
  /* ⚠ Clientul a cerut TREI carduri si a dat textele doar pentru primul. Cand vin
     celelalte doua, numarul de aici se ridica la 3 — pana atunci proba spune
     limpede unde a ramas lucrul. */
  assert.ok(
    CARDURI_PERFORMANTA.length >= 1 && CARDURI_PERFORMANTA.length <= 3,
    "secțiunea are între unu și trei carduri",
  );
});
