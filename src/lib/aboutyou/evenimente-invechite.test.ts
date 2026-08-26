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

test("⚠ lista intreaga se cere in continuare, si nu pierde nimic pe drum", () => {
  assert.equal(ABOUTYOU_WEBHOOK_EVENTS.length, EVENIMENTE_ESENTIALE.length + EVENIMENTE_INVECHITE.length);
  assert.equal(new Set(ABOUTYOU_WEBHOOK_EVENTS).size, ABOUTYOU_WEBHOOK_EVENTS.length, "nume dublat");
});

test("⚠ abonarea se reia cu cele esentiale, dupa ce sterge orfanul", () => {
  /*
   * ⚠ „A picat" nu inseamna „nu s-a creat" — lectia eMAG, unde un raspuns de eroare lasa totusi
   * oferta salvata. O reluare oarba ar face al doilea abonament, si fiecare eveniment ar veni de
   * doua ori. Se cauta dupa URL, care poarta un token generat chiar atunci.
   */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  assert.ok(act.includes("events: ABOUTYOU_WEBHOOK_EVENTS }"), "prima incercare nu mai cere tot");
  assert.ok(act.includes("const orfan = (toate.data ?? []).find((w) => w.url === url);"), "orfanul nu se cauta");
  assert.ok(act.includes("await deleteWebhookSubscription(g.auth, String(orfan.id));"), "orfanul nu se sterge");
  assert.ok(act.includes("events: EVENIMENTE_ESENTIALE }"), "reluarea nu se face");
  /* Si ordinea: stergerea orfanului STRICT inaintea reluarii. */
  assert.ok(act.indexOf("String(orfan.id)") < act.indexOf("events: EVENIMENTE_ESENTIALE }"));
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
