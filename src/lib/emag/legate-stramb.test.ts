import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O OFERTA LEGATA STRAMB SCRIE PRETUL ALTUI PRODUS (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Masurat pe contul unui comerciant real, in aceeasi seara:

     oferta lui 2   la eMAG „Masa de Cafea Dkd Home Decor"  la noi „DOOGIE VITA X 10 kg"
     oferta lui 7   la eMAG „Tastatura Smart TV"            la noi „LOYALIS PREMIUM CAINI"
     oferta lui 10  la eMAG „Laminator A4 Esperanza"        la noi „LOYALIS PREMIUM CAINI"
     oferta lui 433 la eMAG „Vas wc Mondial"                la noi „Calibra Dog Life"

   Toate cu `auto_sync = true` si `last_synced_at` din aceeasi seara: ii scriam preturi de
   hrana pentru caini peste listarile lui de mobila si electronice — 55,99 lei pe o masa de
   cafea, 203,99 pe o tastatura. La fiecare trecere a cronului, si fara nicio eroare.

   ⚠ CAUZA: id-urile ofertelor din contul LUI nu sunt ale noastre. Randurile s-au legat dupa
   `emag_id`, iar acel id la ei inseamna azi alt produs. Reconcilierea scrie `nume_emag` de la
   ei dupa acelasi id, deci randul ajunge o corcitura: numele LOR peste produsul NOSTRU — si
   tocmai asta a facut defectul vizibil.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const mig = readFileSync("migrations/2026-10-31-oferte-legate-stramb.sql", "utf8");
const cron = viu("src/app/api/cron/emag-sync/route.ts");

test("⚠ NUMAI ofertele preluate, nu si cele publicate de noi", () => {
  /*
   * Cea mai importanta taietura. La ofertele publicate de noi legatura e corecta prin
   * constructie: noi am creat oferta PENTRU acel produs si ei ne-au dat id-ul inapoi.
   *
   * ⚠ MASURAT: din 41 de nepotriviri de nume, 31 erau preluate (legaturi gresite) si 10 ale
   * noastre — doar denumite altfel in romaneste la ei, „Recompense pentru pisici, din Vita
   * uscata" pentru „Carnilove Cat Freeze Dried Beef". Oprite si acelea, i-am fi taiat
   * sincronizarea degeaba pe zece produse bune.
   */
  assert.match(mig, /and o\.creat_de_edinio = false/);
});

test("⚠ cuvinte de cel putin TREI litere, si amandoua listele nevide", () => {
  /*
   * Cu pragul la patru, „DOG&DOG PUP, 20 kg" iesea nepotrivit fata de el insusi: toate
   * cuvintele lui sunt mai scurte, deci ambele liste erau goale — iar doua multimi goale nu
   * se intersecteaza niciodata. Proba asta exista fiindca greseala a fost facuta si prinsa.
   */
  assert.match(mig, /where length\(w\) >= 3/);
  assert.match(mig, /cardinality\(n\.a\) > 0 and cardinality\(n\.b\) > 0 and not \(n\.a && n\.b\)/);
});

test("⚠ se raporteaza doar cele care CHIAR ar pleca", () => {
  /* O oferta cu `auto_sync` deja stins nu face rau nimanui; raportata, ar fi umplut lista cu
     lucruri de care nu mai are nimeni nevoie. */
  assert.match(mig, /and o\.auto_sync = true/);
});

test("⚠ SE OPRESTE trimiterea, NU se ghiceste legatura", () => {
  /*
   * `auto_sync = false` e chiar steagul casei pentru „asta e a comerciantului, n-o rescrie".
   * O re-mapare automata ar fi insemnat sa ghicim ce produs a vrut, iar greseala aia scade
   * stocul altuia — exact paguba pe care regula celor doi martori o apara la comenzi.
   */
  assert.match(cron, /auto_sync: false,/);
  assert.doesNotMatch(cron, /product_id: potrivit|remapeaza/, "nu se re-leaga nimic automat");
});

test("⚠ mesajul numeste amandoua numele SI butonul adevarat", () => {
  /* Fara ele, comerciantul stie doar ca ceva s-a oprit — nu si ce e stramb, nici ce sa apese.
     De doua ori in doua zile am trimis pe cineva la un buton inexistent; de-aia se citeaza. */
  assert.match(cron, /se numește acolo/);
  assert.match(cron, /dar la noi e legată de/);
  assert.match(cron, /\$\{BUTON_ADU_OFERTELE\}/);
});

test("⚠ usa functiei e inchisa", () => {
  /* `security definer` peste ofertele oricui: fara revoke, EXECUTE ramane la PUBLIC dupa
     fiecare `create or replace`. */
  assert.match(
    mig,
    /revoke execute on function public\.emag_oferte_legate_stramb\(uuid, int\) from public, anon, authenticated;/,
  );
});
