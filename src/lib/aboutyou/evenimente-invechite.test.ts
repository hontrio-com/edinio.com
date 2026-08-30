import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ABOUTYOU_WEBHOOK_EVENTS, EVENIMENTE_ESENTIALE, EVENIMENTE_INVECHITE,
} from "./webhooks";

/* ══════════════════════════════════════════════════════════════════════════
   TREI EVENIMENTE INVECHITE PUTEAU DARAMA TOT ABONAMENTUL (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `order.shipped`, `order.cancelled` si `order.returned` sunt inlocuite la ei de `order.updated`
   si `order_items.*`. Cerute intr-o lista in care un singur nume nerecunoscut face cererea sa
   pice INTREAGA, ele nu ne aduceau nimic in plus — dar puteau lasa comerciantul fara NICIUN
   webhook, si fara sa afle de ce.

   ⚠ Nu se sterg: documentatia lor e in spatele contului de partener, deci „sunt invechite" e o
   informatie, nu o certitudine. Se cer mai departe, dar separat.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("⚠ cele trei stau deoparte, nu in lista de care depinde abonamentul", () => {
  assert.deepEqual([...EVENIMENTE_INVECHITE].sort(),
    ["order.cancelled", "order.returned", "order.shipped"]);
  for (const e of EVENIMENTE_INVECHITE) assert.ok(!EVENIMENTE_ESENTIALE.includes(e), e);
});

test("⚠ inlocuitoarele lor sunt in cele esentiale", () => {
  /* Fara ele, scoaterea celor trei ar fi fost o pierdere curata. */
  for (const e of ["order.updated", "order_items.shipped", "order_items.cancelled", "order_items.returned"]) {
    assert.ok(EVENIMENTE_ESENTIALE.includes(e), e);
  }
  /* Si restul, care n-au nimic de-a face cu comenzile, raman esentiale. */
  for (const e of ["order.created", "stock.updated", "product_master.status_updated"]) {
    assert.ok(EVENIMENTE_ESENTIALE.includes(e), e);
  }
});

test("⚠ cererea de abonare NU le mai cuprinde", () => {
  /*
   * ═══ ⚠ DIMINEATA ERAU CERUTE „DIN PRISOS" (27.08.2026) ═══
   *
   * Rationamentul de atunci: „«sunt invechite» e o informatie, nu o certitudine, deci se cer mai
   * departe, cu o reluare pe cele esentiale in caz de refuz". Intre timp specificatia lor curenta
   * a fost citita inca o data, separat, si le marcheaza `deprecated`. Doua citiri care spun
   * acelasi lucru — acelasi prag ca la `valid_at`.
   *
   * ⚠ Si nu se pierde nimic: orice eveniment de comanda duce la aceeasi recitire intreaga.
   */
  assert.deepEqual(ABOUTYOU_WEBHOOK_EVENTS, EVENIMENTE_ESENTIALE);
  for (const e of EVENIMENTE_INVECHITE) {
    assert.ok(!ABOUTYOU_WEBHOOK_EVENTS.includes(e), `${e} inca se cere`);
  }
});

test("⚠ dar lista lor ramane scrisa, pentru diagnoza", () => {
  /*
   * Nu din nostalgie: un abonament vechi care inca le poarta e SANATOS, nu stricat, si diagnoza
   * trebuie sa stie asta ca sa nu-l trimita pe comerciant sa repare ce nu e stricat.
   */
  assert.deepEqual([...EVENIMENTE_INVECHITE].sort(),
    ["order.cancelled", "order.returned", "order.shipped"]);
});

test("⚠ si reluarea pe lista scurta s-a scos odata cu ele", () => {
  /*
   * Lista ceruta E deja cea scurta, deci o reluare ar fi retrimis exact aceleasi nume. Un cod care
   * se preface ca mai are o sansa e mai rau decat unul care n-are: la urmatorul audit ar fi trecut
   * drept plasa.
   */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  assert.ok(!act.includes("events: EVENIMENTE_ESENTIALE }"), "reluarea a ramas");
  assert.ok(act.includes("events: ABOUTYOU_WEBHOOK_EVENTS }"));
  assert.ok(!act.includes("const orfan ="), "cautarea orfanului n-are ce pazi fara reluare");
});

test("⚠ diagnoza nu mai raporteaza pe veci „trei evenimente lipsa”", () => {
  /*
   * About You poate primi abonamentul si sa taie tacut evenimentele invechite din el. Comparata cu
   * lista intreaga, unealta facuta sa gaseasca abonamente rupte ar fi aratat mereu rosu pe unul
   * sanatos — iar comerciantul s-ar fi reabonat la nesfarsit ca sa repare ce nu era stricat.
   */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  assert.ok(act.includes("evenimenteLipsa: EVENIMENTE_ESENTIALE.filter((e) => !evenimente.includes(e))"));
  assert.ok(!act.includes("evenimenteLipsa: ABOUTYOU_WEBHOOK_EVENTS.filter"));
});

test("⚠ si orice eveniment de comanda duce la aceeasi recitire, deci nu se pierde informatie", () => {
  /*
   * Asta e temeiul intregii hotarari: `order.shipped` nu aducea o stire proprie, ci declansa
   * `ingestOrderByNumber` — o recitire intreaga a comenzii. La fel face si `order.updated`.
   */
  const inbox = viu("src/lib/aboutyou/inbox.ts");
  assert.ok(inbox.includes('name.startsWith("order")'), "dispecerul nu mai prinde toate comenzile");
  assert.equal((inbox.match(/ingestOrderByNumber\(admin, ctx,/g) ?? []).length, 2,
    "cele doua cai (dupa numar si dupa articole) trebuie sa ramana amandoua");
});
