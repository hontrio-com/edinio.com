import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O COMANDA RESPINSA DE BAZA SE PARCHEAZA, NU SE ARUNCA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `ingereazaComanda` deosebeste „nu va intra niciodata asa" de „nu stim acum", si are
   dreptate: o comanda cu date imposibile tratata ca pana trecatoare ar ingheta fereastra
   INTREGULUI magazin — marcajul nu mai avanseaza si nicio comanda noua nu mai intra.

   ⚠ DAR ATUNCI COMANDA DISPARE. Cade din fereastra de suprapunere in cateva minute, si
   nimeni n-o mai cere vreodata. Ramanea o linie de jurnal, care se pierde in scroll.

   ⚠ SI „PERMANENT" E O MINCIUNA POLITICOASA: constrangerea nu e incalcata de datele lor, ci
   de codul NOSTRU care le potriveste. `statusEdinio(5)` intorcea „returned" pe 24.08;
   `platitLaEi(0)` intorcea „pending" pe 25.08. Amandoua reparate in cateva ore — dar
   comenzile respinse intre timp erau deja pierdute. Adica fiecare defect al meu se
   transforma in pierdere DEFINITIVA de comenzi ale comerciantului.

   Comanda 501350435, 406,99 lei cu ramburs, a intrat la 19:04 dupa reparatie — dar numai
   fiindca eram acolo si m-am uitat in acelasi minut.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const orders = viu("src/lib/emag/orders.ts");

test("⚠ comanda respinsa se scrie in `emag_orders`, cu `raw` intreg", () => {
  /* ⚠ `raw`, nu doar id-ul: reluarea nu mai are de unde cere comanda daca ei au scos-o din
     fereastra intre timp. Raspunsul lor pastrat e singurul izvor care nu se pierde. */
  const i = orders.indexOf("if (permanent) {");
  assert.ok(i > 0, "ramura de parcare exista");
  const ramura = orders.slice(i, i + 1400);
  assert.match(ramura, /\.from\("emag_orders"\)\.upsert\(/);
  assert.match(ramura, /order_id: null,/, "parcata inseamna FARA comanda locala");
  assert.match(ramura, /raw: c as never,/);
  assert.match(ramura, /ingest_error:/, "si motivul, altfel nimeni nu stie ce asteapta");
});

test("⚠ parcarea nu are voie sa schimbe verdictul", () => {
  /*
   * Daca si parcarea pica, tot „sarita" trebuie sa iasa. Altfel o pana in PLASA ar opri
   * avansarea marcajului — adica ar ingheta exact fereastra pe care ramura asta exista s-o
   * apere, si ar transforma o comanda stricata intr-un magazin blocat.
   */
  const i = orders.indexOf("if (permanent) {");
  const dupa = orders.slice(i, orders.indexOf("return permanent ?", i) + 60);
  assert.match(dupa, /return permanent \? "sarita" : "esuata";/);
  assert.doesNotMatch(dupa, /return "esuata";/, "parcarea picata nu inghite fereastra");
});

test("⚠ reluarea citeste din `raw` si sterge motivul DUPA ce comanda a intrat", () => {
  assert.match(orders, /export async function reiaComenzileParcate\(/);
  const i = orders.indexOf("export async function reiaComenzileParcate(");
  const f = orders.slice(i);
  assert.match(f, /\.is\("order_id", null\)/);
  assert.match(f, /\.not\("ingest_error", "is", null\)/);
  /* ⚠ Ordinea conteaza: sters inainte, randul ar fi iesit din lista parcatelor si n-ar mai
     fi fost reluat de nimeni — o comanda pierduta de chiar plasa care o cauta. */
  const iVerdict = f.indexOf('rez === "noua"');
  const iStergere = f.indexOf("ingest_error: null");
  assert.ok(iVerdict > 0 && iStergere > iVerdict, "stergerea vine dupa verdict");
});

test("⚠ o citire picata a parcatelor nu raporteaza zero", () => {
  /* Un zero fals arata identic cu „nu mai e nimic parcat" — si atunci nimeni nu mai cauta.
     Se iese fara sa se pretinda un numar, si se scrie in jurnal. */
  const i = viu("src/lib/emag/orders.ts").indexOf("export async function reiaComenzileParcate(");
  const f = viu("src/lib/emag/orders.ts").slice(i);
  assert.match(f, /if \(error\) \{[\s\S]{0,400}?comenzile parcate nu s-au putut citi/);
});

test("⚠ cronul chiar cheama reluarea, la fiecare trecere", () => {
  /*
   * ⚠ La fiecare trecere, nu la un minut anume: cand exista o comanda parcata, ea e o
   * comanda a comerciantului care nu se vede in panou. Lista e goala in mod normal, deci
   * costul obisnuit e o citire care nu gaseste nimic.
   */
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /const parcate = await reiaComenzileParcate\(admin, ctx\);/);
  assert.match(cron, /comenzi parcate au intrat dupa o reparatie de cod/, "si o spune");
});

test("⚠ migratia pastreaza indexul PARTIAL", () => {
  /* Comenzile parcate sunt cateva, cele intrate sunt toate. Un index pe toata tabela ar fi
     purtat degeaba fiecare comanda a fiecarui magazin. */
  const mig = readFileSync("migrations/2026-10-24-comanda-parcata.sql", "utf8");
  assert.match(mig, /create index if not exists emag_orders_parcate_idx[\s\S]{0,200}?where order_id is null;/);
});
