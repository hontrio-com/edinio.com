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

test("⚠ reconcilierea catalogului nu mai porneste de la pagina 1", () => {
  /*
   * ═══ ⚠ CU PLAFON DE 50 DE PAGINI SI UN BUGET DE TIMP, ULTIMELE NU VENEAU NICIODATA ═══
   *
   * Bugetul se termina de obicei mai devreme decat plafonul, deci un catalog mare nu ajungea
   * NICIODATA la sfarsit: primele pagini se reconciliau de zeci de ori pe ora, ultimele niciodata.
   * Un produs respins de ei, aflat pe pagina 60, ramanea la noi „activ" pentru totdeauna — si
   * comerciantul nu afla de ce nu se vinde.
   *
   * ⚠ E CHIAR DEFECTUL REPARAT LA TRENDYOL: „scanarea fixa de 5 pagini de la zero n-a vazut
   * niciodata nimic dupa produsul 500 intr-un catalog de 1033". eMAG are de mult `reconcile_page`;
   * aici lipsea.
   */
  const sync = viu("src/lib/aboutyou/sync.ts");
  assert.match(sync, /const dePeLa = Math\.max\(1, Number\(ctx\.config\.reconcile_page \?\? 1\) \|\| 1\);/);
  assert.match(sync, /for \(let page = dePeLa; page < dePeLa \+ maxPages; page\+\+\)/);

  /* ⚠ Cursorul se scrie SI cand s-a oprit din buget, nu doar la capat — tocmai oprirea din buget
     e cazul obisnuit, si singurul in care „de la 1" insemna sa nu se ajunga niciodata mai departe. */
  assert.match(sync, /await patchAboutYouConfig\(admin, ctx\.businessId, \{ reconcile_page: urmatoarea \}\)/);

  /* ⚠ Si cand catalogul se termina, roata se intoarce la 1: altfel cursorul ar creste la
     nesfarsit si fiecare rulare ar cere pagini goale. */
  assert.match(sync, /trunchiat = false; urmatoarea = 1; break;/);
});

test("⚠ si petecul de configurare are un singur loc", () => {
  /* Scris a doua oara, cele doua s-ar fi despartit la prima schimbare — chiar tiparul care a lasat
     cinci cozi cu apararea pusa pe doua. */
  const cron = viu("src/app/api/cron/aboutyou-sync/route.ts");
  assert.match(cron, /from "@\/lib\/aboutyou\/config"/);
  assert.doesNotMatch(cron, /async function patchConfig\(/);
});

test("⚠ anularea si returul pornite din Edinio sunt marcate ca nechemate", () => {
  /*
   * Cautat in tot depozitul: singurele aparitii sunt definitiile. Nu exista nici actiune de
   * server, nici buton — deci fluxul nu exista in practica, oricat de complet ar arata codul.
   *
   * ⚠ Nu se sterg: sunt scrise cu grija si azi li s-au strans si filtrele de stare. Ce lipseste e
   * o hotarare de ecran, nu cod.
   */
  const brut = readFileSync("src/lib/aboutyou/orders.ts", "utf8");
  assert.match(brut, /NIMENI NU CHEAMA `cancelOrderNow` SI `returnOrderNow`/);
});
