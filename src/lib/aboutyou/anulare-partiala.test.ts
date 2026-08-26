import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   LA EI STATUSUL STA PE LINIE, NU PE COMANDA (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `AboutYouOrderItem.status` poate fi `open`, `shipped`, `cancelled` sau `returned`, iar comanda
   intreaga devine `mixed` cand liniile nu spun acelasi lucru.

   Ingestul trecea prin motorul de stoc DOAR cand toata comanda ajungea `cancelled` sau
   `returned`. Deci:

       comanda: A x 1, B x 1   -> se consuma stoc pentru amandoua
       A -> cancelled, B -> open
       comanda -> `mixed`

   ⚠ Poarta nu se deschide. Iar `consuma_stoc_comanda_marketplace` e idempotenta prin
   `stoc_marketplace_la`: la trecerea urmatoare A e scoasa din socoteala, dar consumul NU se mai
   reface — intoarce `deja: true`. Stocul lui A ramane consumat PENTRU TOTDEAUNA, pentru marfa
   care n-a plecat nicaieri.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const orders = viu("src/lib/aboutyou/orders.ts");
const mig = readFileSync("migrations/2026-11-18-aboutyou-anulari-partiale.sql", "utf8");

test("⚠ liniile ANULATE se aduna separat, pe cheia lor", () => {
  assert.match(orders, /const anulate = items/);
  assert.match(orders, /\.filter\(\(\{ it \}\) => it\.status === "cancelled"\)/);
  /* ⚠ Aceeasi cheie ca la retururi: id-ul liniei, cu rezerva determinista pe indice — ca a doua
     citire a aceleiasi comenzi sa nimereasca acelasi rand, nu unul nou. */
  assert.match(orders, /linie_cheie: it\.id != null \? String\(it\.id\) : `sku:\$\{it\.sku\}:\$\{indice\}`/);
  /* ⚠ Fara produs legat n-avem ce elibera. */
  assert.match(orders, /\.filter\(\(l\) => l\.product_id\)/);
});

test("⚠ eliberarea si marcarea sunt ACELASI lucru, in baza", () => {
  /*
   * Facute separat — elibereaza, apoi scrie ca ai eliberat — o cadere intre ele lasa stocul
   * crescut si marcajul nescris, iar trecerea urmatoare il creste iar. Aceeasi hotarare ca la
   * `trendyol_repune_stoc_retur`.
   */
  assert.match(mig, /FUNCTION public\.aboutyou_elibereaza_anulari/);
  assert.match(mig, /for update;/, "randul se incuie");
  assert.match(mig, /not \(v_deja @> to_jsonb\(array\[l->>'linie_cheie'\]\)\)/);
  assert.match(mig, /set anulate_eliberate = v_deja \|\|/);
});

test("⚠ cu variante se elibereaza NUMAI pe varianta", () => {
  /* `elibereaza_stoc_complet` scade si din produs cand primeste ambele liste, iar stocul unui
     produs cu variante e DERIVAT din ele: s-ar aduna de doua ori. */
  assert.match(mig, /case when jsonb_array_length\(v_variante\) > 0 then '\[\]'::jsonb else v_produse end/);
});

test("⚠ o eliberare picata OPRESTE fereastra", () => {
  /*
   * Protocolul fisierului: se arunca, iar `pollOrders` prinde si pune `ok = false`. O eliberare
   * picata n-are voie sa mute fereastra — altfel linia anulata ramane cu stocul consumat pentru
   * totdeauna, si nimeni nu mai afla.
   */
  const i = orders.indexOf("async function elibereazaAnularile");
  const f = orders.slice(i, orders.indexOf("\n}", i));
  assert.match(f, /throw new Error\(/);
  assert.match(f, /severity: "critical"/);

  /* ⚠ Si se cheama DUPA consum: consumul e cel care aseaza `stoc_marketplace_la`. */
  const iCons = orders.indexOf("await consumaStoculComenzii(admin, ctx, ex.order_id");
  const iElib = orders.indexOf("await elibereazaAnularile(admin, ctx, ayNumber, anulate)");
  assert.ok(iCons > 0 && iElib > iCons, "eliberarea vine dupa consum");
});

test("⚠ MASURAT pe baza adevarata, in tranzactie anulata", () => {
  /*
   * Pe INSTRUCTIUNI SEPARATE: intr-un singur `SELECT`, sub-selectarile vad aceeasi fotografie si
   * nu arata ce au scris apelurile de langa ele. Prima masuratoare a iesit „nu s-a intamplat
   * nimic" tocmai din asta — unealta minte, nu functia.
   *
   *     inainte             stoc 1
   *     A, prima apasare    {stare: "eliberat", eliberate: 1}  -> stoc 2
   *     A, a doua apasare   {stare: "deja",     eliberate: 0}  -> stoc 2
   *     B, alta linie       {stare: "eliberat", eliberate: 1}  -> stoc 3
   *     marcaj              ["linia-A", "linia-B"]
   */
  assert.match(mig, /'stare', 'deja'/);
  assert.match(mig, /'stare', 'eliberat'/);
  /* ⚠ Si o comanda pe care n-o gasim nu se preface ca a eliberat ceva. */
  assert.match(mig, /'stare', 'lipsa'/);
});
