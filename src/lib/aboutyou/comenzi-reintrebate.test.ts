import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   FEREASTRA FILTREAZA DUPA DATA CREARII, DECI NU VEDE O SCHIMBARE TARZIE
   ══════════════════════════════════════════════════════════════════════════

   Scrie chiar in codul nostru, la `candFacuta`: „Cursorul se construieste NUMAI din campul dupa
   care se si filtreaza fereastra (`orders_from` merge pe `created_at`)."

   ⚠ Deci o comanda facuta acum trei saptamani care se anuleaza AZI nu mai reintra in nicio
   fereastra: marcajul a trecut demult de data crearii ei. Ce se schimba la ea — o linie anulata,
   una expediata, un retur — nu se mai afla NICIODATA pe calea obisnuita.

   ⚠ Webhook-ul e calea rapida, dar nu e o garantie: daca ruta noastra e indisponibila cat timp ei
   reincearca (~doua zile), evenimentul se pierde definitiv, iar sondarea nu-l poate recupera.

   ⚠ ACEEASI FORMA CA LA RETURURILE TRENDYOL, reparata in aceeasi zi si din acelasi motiv: ce se
   schimba in timp nu se urmareste cu o fereastra care merge inainte.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const orders = viu("src/lib/aboutyou/orders.ts");
const cron = viu("src/app/api/cron/aboutyou-sync/route.ts");

test("⚠ comenzile neincheiate se reintreaba pe NUMAR, nu pe timp", () => {
  assert.match(orders, /export async function reconciliazaComenzile\(/);
  assert.match(orders, /await ingestOrderByNumber\(admin, ctx, r\.aboutyou_order_number\)/);
});

test("⚠ se numesc starile INCHEIATE, nu cele vii", () => {
  /*
   * O lista de „stari vii" lasa pe dinafara tot ce nu cunoastem, iar `status`-ul liniei poate
   * primi valori noi fara sa ne intrebe. `shipped` NU e incheiata: de-acolo se ajunge la
   * `returned`.
   */
  assert.match(orders, /const LINII_INCHEIATE_AY = new Set\(\["cancelled", "returned"\]\)/);
  assert.doesNotMatch(orders, /LINII_INCHEIATE_AY = new Set\(\[[^\]]*shipped/);

  /* ⚠ Si o comanda fara linii citibile se intreaba: e cea despre care stim cel mai putin. */
  assert.match(orders, /if \(linii\.length === 0\) return true;/);
});

test("⚠ NU muta niciun marcaj", () => {
  /* E o reconciliere, nu o aducere: n-are fereastra, deci n-are ce pierde si n-are ce avansa. */
  const i = orders.indexOf("export async function reconciliazaComenzile(");
  const f = orders.slice(i, orders.indexOf("\nexport async function ingestOrderByNumber", i));
  assert.doesNotMatch(f, /orders_synced_at/);
  assert.doesNotMatch(f, /marcajUrmator/);
});

test("⚠ roata se invarte pe TOATE cele citite, nu doar pe cele reintrebate", () => {
  /*
   * O comanda incheiata ramasa in bazin ar fi mereu prima in rand si le-ar tine pe celelalte pe
   * loc — chiar infometarea pe care rotatia o inlatura. E aceeasi lectie ca la roata retururilor
   * Trendyol, unde ordonarea pe un camp scris de furnizor nu se invartea deloc.
   */
  assert.match(orders, /\.order\("reintrebat_la", \{ ascending: true, nullsFirst: true \}\)/);
  assert.match(orders, /\.in\("aboutyou_order_number", randuri\.map\(\(r\) => r\.aboutyou_order_number\)\)/);
});

test("⚠ si bazinul e marginit in timp", () => {
  /* Fara margine, creste la nesfarsit cu comenzi agatate intr-o stare pe care ei n-o mai schimba
     niciodata — iar cele vii ar astepta dupa ele. */
  assert.match(orders, /const ZILE_DE_REINTREBAT_AY = 60;/);
  assert.match(orders, /\.gte\("created_at", deLa\)/);
});

test("⚠ cronul chiar o cheama, pe o tura proprie", () => {
  assert.match(cron, /await reconciliazaComenzile\(admin, ctx\)/);
  assert.match(cron, /getMinutes\(\) % 5 === 2/);
  /* ⚠ Si sub bugetul rularii: pasul asta nu are voie sa manance fereastra celorlalti. */
  assert.match(cron, /if \(Date\.now\(\) - inceput > BUGET_TOTAL_MS\) break;/);
});
