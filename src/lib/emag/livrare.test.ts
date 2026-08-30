import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eLivratLaEi } from "./livrare";
import { seConsumaLaIntrare, statusEdinio } from "./orders";

/* ══════════════════════════════════════════════════════════════════════════
   „LIVRAT” SE AFLA DE LA CURIER, NU DIN STATUSUL COMENZII (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Comerciantul VetDepo a spus-o primul: comanda EMAG-500822531 arata LIVRAT, desi coletul
   inca mergea spre client. Masurat: eMAG chiar trimite `status: 4` pe ea.

   ⚠ DAR 4 INSEAMNA „FINALIZATA” LA EI, NU „LIVRATA”. Enumul lor, scris si in codul nostru:
   0 anulata · 1 noua · 2 in procesare · 3 pregatita · 4 finalizata · 5 returnata. E ciclul
   de viata al comenzii IN CONTUL LOR, nu drumul coletului. La fel, 3 „pregatita” inseamna
   gata de predare, nu plecata.

   ⚠ CE COSTA: o informatie falsa la vedere, si un magazin care alege „factura la livrare”
   ar fi facturat prea devreme. (Verificat: VetDepo factureaza la `confirmed`, deci pe el nu
   l-a atins — dar urmatorul comerciant putea alege altfel.)
*/

test("⚠ 3 „pregatita” nu e expediat, 4 „finalizata” nu e livrat", () => {
  assert.equal(statusEdinio(3), "processing", "„pregatita” = gata de predare, nimic n-a plecat");
  assert.equal(statusEdinio(4), "shipped", "„finalizata” = a plecat; livrarea nu se stie de aici");
  /* Celelalte raman neatinse. */
  assert.equal(statusEdinio(0), "cancelled");
  assert.equal(statusEdinio(1), "pending");
  assert.equal(statusEdinio(2), "processing");
  assert.equal(statusEdinio(5), "refunded");
});

test("⚠ stocul se consuma la fel ca inainte", () => {
  /*
   * `seConsumaLaIntrare` se sprijina pe `statusEdinio`, deci o remapare putea schimba, fara
   * sa se vada, care comenzi scad stocul la intrare. Taietura e insa pe „anulata/returnata",
   * iar acelea n-au fost atinse.
   */
  for (const s of [1, 2, 3, 4]) assert.equal(seConsumaLaIntrare(s), true, `status ${s}`);
  for (const s of [0, 5]) assert.equal(seConsumaLaIntrare(s), false, `status ${s}`);
});

/* ── Cititorul de livrare ──────────────────────────────────────────────────── */

test("⚠ trei raspunsuri, nu doua: si „nu stiu”", () => {
  /*
   * Raspunsul lui `/awb/read` NU e in schema lor — aceeasi poveste ca la `ownership`, care a
   * venit `boolean` acolo unde documentatia scrie 1/2. Deci nu se citeste o cheie ghicita.
   *
   * ⚠ `null` NU se citeste ca „nu s-a livrat" si nici ca „s-a livrat". Un `false` implicit ar
   * fi tinut comanda „expediata" la nesfarsit fara sa se stie de ce; un `true` implicit ar fi
   * marcat livrate colete aflate in drum — chiar defectul pentru care exista fisierul.
   */
  assert.equal(eLivratLaEi({}), null, "raspuns gol");
  assert.equal(eLivratLaEi(null), null);
  assert.equal(eLivratLaEi({ cod: 77 }), null, "numere fara cuvinte nu spun nimic");
  assert.equal(eLivratLaEi({ status: "Cod necunoscut" }), null);
});

test("⚠ livrarea se recunoaste, si in romana, si adanc in raspuns", () => {
  assert.equal(eLivratLaEi({ status: "Delivered" }), true);
  assert.equal(eLivratLaEi({ stare: "LIVRAT" }), true, "literele mari nu conteaza");
  /* ⚠ Cu diacritice: normalizarea le scoate, altfel „livrată" n-ar fi fost recunoscut. */
  assert.equal(eLivratLaEi({ stare: "Comandă livrată" }), true);
  /* ⚠ Oricat de adanc: nu depindem de numele cheilor, fiindca nu le stim. */
  assert.equal(eLivratLaEi({ results: [{ history: [{ event: "Delivered" }] }] }), true);
});

test("⚠ o stare finala NU e o livrare, si NELIVRAT bate LIVRAT", () => {
  /*
   * Cea mai importanta proba din fisier. „Returned to sender" e final, dar coletul s-a intors
   * la magazin — marcat „livrat", comerciantul ar fi crezut ca clientul l-a primit, iar
   * rambursul l-ar fi asteptat degeaba.
   */
  assert.equal(eLivratLaEi({ status: "Returned to sender" }), false);
  assert.equal(eLivratLaEi({ status: "Refuzat de destinatar" }), false);
  assert.equal(eLivratLaEi({ status: "In Transit" }), false);
  assert.equal(eLivratLaEi({ status: "Out for delivery" }), false);
  /* ⚠ Amandoua semnele deodata: „livrat inapoi la expeditor" nu e o livrare la client. */
  assert.equal(eLivratLaEi({ istoric: ["Livrat", "Returned"] }), false);
});

test("⚠ nu se invarte la nesfarsit pe un raspuns cu bucla", () => {
  /* Cititorul e chemat din cron, pe raspunsuri pe care nu le controlam. */
  const a: Record<string, unknown> = { status: "In Transit" };
  a.eu = a;
  assert.equal(eLivratLaEi(a), false);
});

test("⚠ numai AWB-ul de TUR se urmareste", () => {
  /*
   * `awb_type: 2` e ridicarea de la client: livrarea LUI inseamna ca marfa s-a intors la
   * magazin, nu ca a ajuns la cumparator. Confundate, o comanda returnata ar fi fost marcata
   * „livrata" chiar de returul ei.
   */
  const mig = readFileSync("migrations/2026-10-26-emag-awb-urmarire.sql", "utf8");
  assert.match(mig, /coalesce\(a\.status->>'awb_type', '1'\) <> '2'/);
  /* ⚠ Si nu se intreaba la nesfarsit: un AWB de acum trei luni nu mai ajunge „livrat", iar
     fiecare intrebare arde o cerere din cele 3 pe secunda ale magazinului. */
  assert.match(mig, /a\.created_at > now\(\) - interval '60 days'/);
  /* ⚠ Nici comenzile terminate. */
  assert.match(mig, /o\.status in \('pending', 'confirmed', 'processing', 'shipped'\)/);
});
