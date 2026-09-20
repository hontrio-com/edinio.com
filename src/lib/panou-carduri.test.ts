import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  citesteDateCarduri, cresterePosibila, rataConversie, valoareMedie, zileScurt,
} from "./panou-carduri";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CELE PATRU CARDURI: ce se poate strica fara sa dea eroare
  ═══════════════════════════════════════════════════════════════════════════════

  Cifrele vin din `panou_carduri`. Aici raman doua impartiri, si fiecare are un
  numitor care poate fi zero. O impartire la zero in JavaScript nu arunca nimic:
  da `Infinity` sau `NaN`, care ajung pe card scrise „∞" sau „NaN".
*/

test("un magazin fara comenzi nu are valoare medie, si nu scrie NaN", () => {
  assert.equal(valoareMedie({ vanzari: 0, comenzi: 0 }), null);
  assert.equal(valoareMedie({ vanzari: 1000, comenzi: 4 }), 250);
});

test("fara vizite, rata de conversie e necunoscuta, nu zero", () => {
  /* ⚠ „0%" spune „au venit oameni si n-a cumparat niciunul". Lipsa vizitelor
     spune cu totul altceva, iar un magazin nou ar fi crezut ca are o problema
     de vanzare cand de fapt n-are inca trafic. */
  assert.equal(rataConversie({ comenzi: 0, vizite: 0 }), null);
  assert.equal(rataConversie({ comenzi: 5, vizite: 0 }), null);
  assert.equal(rataConversie({ comenzi: 66, vizite: 3300 }), 2);
});

test("cresterea cere amandoua capetele cunoscute", () => {
  assert.equal(cresterePosibila(null, 10), null);
  assert.equal(cresterePosibila(10, null), null);
  assert.equal(cresterePosibila(12, 10), 20);
  /* Perioada precedenta pe zero nu da „+100%": vezi `crestere`. */
  assert.equal(cresterePosibila(12, 0), null);
});

test("zilele lunii trecute se scriu scurt, cu luna LOR", () => {
  assert.equal(zileScurt("2026-08-01", "2026-08-20"), "1 - 20 aug.");
  assert.equal(zileScurt("2026-02-01", "2026-02-01"), "1 feb.");
});

test("un raspuns de alta forma da null, nu o cadere in panou", () => {
  assert.equal(citesteDateCarduri(null), null);
  assert.equal(citesteDateCarduri({ azi: { comenzi: 1 } }), null, "fara cele patru ferestre nu e intreg");
});

test("numerele venite ca text se citesc tot ca numere", () => {
  /* `numeric` poate ajunge ca sir; adunate asa, „10" + „20" ar da „1020". */
  const citit = citesteDateCarduri({
    azi: { comenzi: "3" },
    ieri_pana_acum: { comenzi: "2", ora: "14:54" },
    luna: { vanzari: "1000.50", comenzi: "4", vizite: "200", de_la: "2026-09-01", pana_la: "2026-09-20" },
    luna_trecuta: { vanzari: "800", comenzi: "4", vizite: "100", de_la: "2026-08-01", pana_la: "2026-08-20" },
  });
  assert.ok(citit);
  assert.equal(citit.luna.vanzari, 1000.5);
  assert.equal(citit.azi.comenzi, 3);
  assert.equal(valoareMedie(citit.luna), 250.125);
  /* Si drumul intreg: conversia lunii fata de aceleasi zile ale lunii trecute. */
  assert.equal(rataConversie(citit.luna), 2);
  assert.equal(rataConversie(citit.luna_trecuta), 4);
  assert.equal(cresterePosibila(rataConversie(citit.luna), rataConversie(citit.luna_trecuta)), -50);
});
