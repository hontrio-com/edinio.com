import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CARDURI_PERFORMANTA,
  CULORI_SCOR,
  IMAGINE_OPTIMIZATA,
  PRAG_BUN,
  SCORURI_PAGESPEED,
  culoareScor,
  greutate,
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
  /* Trei, câte a cerut clientul. Grila e două coloane la `sm` și trei la `lg`,
     deci un al patrulea ar rămâne singur pe al doilea rând, la orice lățime. */
  assert.equal(CARDURI_PERFORMANTA.length, 3);
});

test("greutatea se scrie pe înțelesul omului", () => {
  /* „5 MB", nu „5,0 MB": cifra clientului trebuie să rămână chiar cum a dat-o. */
  assert.equal(greutate(5 * 1024 * 1024), "5 MB");
  assert.equal(greutate(124 * 1024), "124 KB");
  /* Sub un megaoctet, fără zecimale — nimeni nu spune „873,4 KB". */
  assert.equal(greutate(873 * 1024 + 400), "873 KB");
  /* Peste, cu o zecimală. */
  assert.equal(greutate(Math.round(1.24 * 1024 * 1024)), "1,2 MB");
});

test("coborârea logaritmică trece prin toate ordinele de mărime", () => {
  /*
    ⚠ Aici e tot rostul animației. Între 5 MB și 124 KB sunt patruzeci de ori.
    LINIAR, cifra ar sta aproape tot timpul în megaocteți și ar sări în kiloocteți
    în ultima zecime de secundă — adică s-ar vedea o cifră care nu se mișcă, apoi
    un salt. În LOGARITM petrece la fel de mult timp în fiecare ordin de mărime.

    Proba numără câți pași din o sută cad sub un megaoctet. Măsurat: liniar 18,
    logaritmic 57 — de peste trei ori mai mult timp petrecut acolo unde cifra e
    interesantă.
  */
  const { inainte, dupa } = IMAGINE_OPTIMIZATA;
  const PASI = 100;
  const log = (t: number) =>
    Math.exp(Math.log(inainte) + (Math.log(dupa) - Math.log(inainte)) * t);
  const liniar = (t: number) => inainte + (dupa - inainte) * t;

  const subUnMega = (f: (t: number) => number) =>
    Array.from({ length: PASI }, (_, i) => f(i / (PASI - 1))).filter(
      (o) => o < 1024 * 1024,
    ).length;

  const inKB = { log: subUnMega(log), liniar: subUnMega(liniar) };
  assert.ok(inKB.log > PASI * 0.5, `logaritmic stă prea puțin în KB: ${inKB.log}%`);
  /* Controlul negativ: fără el, proba ar fi trecut și dacă cele două ar fi
     identice. Liniar chiar sare — stă sub un mega doar in ultima cincime. */
  assert.ok(inKB.liniar < PASI * 0.25, `control: liniarul nu sare: ${inKB.liniar}%`);
  assert.ok(inKB.log > inKB.liniar * 2, "cele două coborâri se poartă la fel");

  /* Și ajunge exact unde trebuie, la amândouă capetele. */
  assert.equal(Math.round(log(0)), inainte);
  assert.equal(Math.round(log(1)), dupa);
});
