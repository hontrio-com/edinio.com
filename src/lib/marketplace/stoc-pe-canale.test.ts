import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   UN SINGUR INVENTAR, PE TOATE CANALELE (24.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Calea magazinului propriu impinge stocul pe toate cinci canalele de mult, corect.
   Cele trei cai de marketplace nu-l impingeau pe NICIUNUL: se vindea o bucata pe
   Trendyol, stocul Edinio scadea, iar eMAG ramanea cu valoarea veche si continua s-o
   vanda. Comerciantul primea a doua comanda pentru marfa pe care n-o mai avea.

   ⚠ „Un singur inventar" e chiar propozitia cu care se vinde Edinio. Fara pasul asta e
   adevarata doar cat timp se vinde pe un singur canal — adica pana cand integrarea
   incepe sa fie folosita.
*/

const CAI = [
  ["src/lib/emag/orders.ts", "emag"],
  ["src/lib/trendyol/orders.ts", "trendyol"],
  ["src/lib/aboutyou/orders.ts", "aboutyou"],
] as const;

test("toate cele trei cai de marketplace imping stocul pe celelalte canale", () => {
  for (const [fisier, canal] of CAI) {
    const sursa = readFileSync(fisier, "utf8");
    assert.ok(
      sursa.includes("impingeStoculPeCeleLalteCanale("),
      `${fisier}: o vanzare de aici nu spune nimanui altcuiva ca stocul s-a schimbat`,
    );
    assert.ok(
      sursa.includes(`"${canal}"`),
      `${fisier}: trebuie sa-si spuna numele, ca sa NU-si trimita siesi mișcarea inapoi`,
    );
  }
});

test("impingerea vine DUPA consumul de stoc, nu inaintea lui", () => {
  /*
   * ⚠ Inaintea consumului, s-ar trimite stocul VECHI — adica exact valoarea gresita, cu
   * incredere, si mai repede decat inainte. Ordinea nu e o preferinta.
   */
  for (const [fisier] of CAI) {
    const sursa = readFileSync(fisier, "utf8");
    const consum = Math.min(
      ...["consumaStocul(", "consumaStoculComenzii("]
        .map((n) => sursa.indexOf(n))
        .filter((i) => i >= 0),
    );
    const impinge = sursa.indexOf("impingeStoculPeCeleLalteCanale(");
    assert.ok(consum < impinge, `${fisier}: se impinge stocul inainte sa fie scazut`);
  }
});

test("canalul de unde a venit comanda se SARE", () => {
  /*
   * ⚠ El stie deja: chiar el a vandut bucata si si-a scazut stocul singur. Trimis inapoi,
   * ar fi o cerere arsa din cota magazinului la FIECARE comanda — iar cotele alea sunt
   * exact cele prin care trebuie sa plece miscarile astea.
   */
  const sursa = readFileSync("src/lib/marketplace/stoc-pe-canale.ts", "utf8");
  assert.ok(sursa.includes("filter((c) => c !== venitDe)"), "canalul de origine nu se sare");
});

test("nu arunca niciodata: ar opri marcajul ferestrei de comenzi", () => {
  /*
   * ⚠ Se cheama din calea de preluare a comenzilor. O exceptie acolo ar opri marcajul si
   * ar bloca intrarea comenzilor URMATOARE — o paguba mult mai mare decat cea reparata.
   */
  const sursa = readFileSync("src/lib/marketplace/stoc-pe-canale.ts", "utf8");
  assert.ok(sursa.includes("Promise.allSettled("), "o coada picata ar rupe preluarea comenzii");
});
