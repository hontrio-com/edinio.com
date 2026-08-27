import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   ANULAREA TOTALA ELIBERA STOCUL DE DOUA ORI (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ MASURAT PE PRODUCTIE, intr-o tranzactie data inapoi:

       stoc la inceput ........................ 120
       dupa tranzitia intregii comenzi ........ 122   (+2, corect)
       dupa eliberarea per linie .............. 124   (+2 INCA O DATA)

   Doua bucati rezervate, patru eliberate. Stocul umflat se vinde, si se vinde ce nu exista.

   ⚠ DE CE. `ingestOrder` face doua lucruri cand comanda trece pe `cancelled`: tranzitia terminala
   elibereaza REZERVAREA INTREAGA, iar `elibereazaAnularile` elibereaza FIECARE LINIE anulata. La o
   anulare partiala e exact ce trebuie - statusul ramane `mixed`, deci prima cale nici nu porneste.
   La una TOTALA pornesc amandoua.

   ⚠ FIECARE SE APARA DE SINE, NICIUNA DE CEALALTA: `elibereaza_stoc_comanda` are
   `stoc_eliberat_la is null`, iar RPC-ul are lista `anulate_eliberate`. Doua paze bune care nu se
   vad una pe alta.

   ⚠ DUPA REPARATIE, aceeasi masuratoare da 120 → 122 → 122, iar RPC-ul raspunde
   `acoperit-de-comanda`. Iar anularea partiala a ramas neatinsa: 120 → 121 → 121 (a doua chemare
   pe aceeasi linie) → 122.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const orders = viu("src/lib/aboutyou/orders.ts");
const migratie = readFileSync("migrations/2026-11-25-aboutyou-anularea-totala-nu-dubleaza-stocul.sql", "utf8");

test("⚠ paza adevarata e IN BAZA, unde se intalnesc cele doua cai", () => {
  /*
   * O saritura numai in TypeScript ar fi tinut doar cat timp nimeni nu adauga alt drum catre RPC.
   * In baza tine oricare ar fi ordinea chemarilor si oricine ar chema.
   */
  assert.match(migratie, /select o\.stoc_eliberat_la is not null into v_deja_eliberat_tot/);
  assert.match(migratie, /if coalesce\(v_deja_eliberat_tot, false\) then/);
  assert.match(migratie, /'stare', 'acoperit-de-comanda'/);
});

test("⚠ liniile se marcheaza totusi ca eliberate, desi nu s-a eliberat nimic", () => {
  /*
   * Nemarcate, fiecare trecere a ingestului le-ar lua de la capat la nesfarsit. Iar daca mai
   * tarziu comanda s-ar redeschide, ar fi eliberate a doua oara pe bune.
   */
  const i = migratie.indexOf("if coalesce(v_deja_eliberat_tot, false) then");
  const bucata = migratie.slice(i, i + 700);
  assert.match(bucata, /set anulate_eliberate = v_deja \|\|/);
  assert.match(bucata, /'marcate', jsonb_array_length\(v_noi\)/);
});

test("⚠ si codul nu mai cheama degeaba la o anulare totala", () => {
  assert.match(orders, /if \(order\.status !== "cancelled"\) \{\s*await elibereazaAnularile\(/);
});

test("⚠ dar saritura din cod e ECONOMIE, si asa scrie", () => {
  /*
   * ⚠ Un comentariu care da sarituri din cod drept paza de siguranta devine fapt pentru cine il
   * citeste mai tarziu - si atunci cineva scoate paza din baza „fiindca oricum se sare".
   */
  const brut = readFileSync("src/lib/aboutyou/orders.ts", "utf8");
  assert.match(brut, /Saritura de aici e\s+\* economie, nu siguranta/);
});

test("⚠ cand plasa din baza chiar lucreaza, se scrie", () => {
  /* Ajunge acolo numai daca saritura n-a prins cazul: inseamna un drum la care nu m-am gandit. */
  assert.match(orders, /if \(r\.stare === "acoperit-de-comanda"\) \{/);
  assert.match(orders, /erau deja acoperite de eliberarea intregii comenzi/);
});

test("⚠ anularea partiala si-a pastrat idempotenta pe `linie_cheie`", () => {
  /* Reparatia n-avea voie sa strice cazul pentru care RPC-ul fusese scris. */
  assert.match(migratie, /where not \(v_deja @> to_jsonb\(array\[l->>'linie_cheie'\]\)\)/);
  assert.match(migratie, /'stare', 'deja', 'eliberate', 0/);
});
