import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   RUTA RASPUNDEA 200 SI CAND N-A PRELUCRAT NIMIC (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   About You reincearca livrarea vreo doua zile daca nu primeste un raspuns bun. Ruta noastra
   raspundea insa `200` pe TOATE caile, inclusiv cand ingestia pica — o pana de baza, o exceptie,
   o comanda pe care n-o gasim. Pentru ei, evenimentul era livrat: nu-l mai reincercau.

   ⚠ SI SONDAREA NU-L POATE RECUPERA, fiindca filtreaza dupa data CREARII comenzii. Deci o
   expediere sau o anulare pierduta era pierduta DEFINITIV.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const ruta = viu("src/app/api/aboutyou/webhook/route.ts");
const inbox = viu("src/lib/aboutyou/inbox.ts");
const cron = viu("src/app/api/cron/aboutyou-sync/route.ts");

test("⚠ evenimentul se SCRIE inainte sa fie prelucrat", () => {
  const iScris = ruta.indexOf('from("aboutyou_webhook_inbox").upsert');
  const iPrelucrat = ruta.indexOf("await prelucreazaEveniment(");
  assert.ok(iScris > 0, "scrierea in inbox exista");
  assert.ok(iPrelucrat > iScris, "prelucrarea vine DUPA scriere");
});

test("⚠ si numai acolo raspundem cu esec, ca ei sa reincerce", () => {
  /*
   * E singurul loc unde reincercarea lor chiar ajuta: n-am pastrat evenimentul, deci daca ne
   * oprim aici e pierdut definitiv.
   */
  assert.match(ruta, /status: 503/);
  const i = ruta.indexOf("if (eInbox)");
  const f = ruta.slice(i, i + 600);
  assert.match(f, /severity: "critical"/);
  assert.match(f, /status: 503/);
});

test("⚠ cele trei `200` de la autentificare RAMAN", () => {
  /*
   * Un eveniment fara secret sau cu semnatura gresita n-are cum sa devina bun daca il mai trimit
   * o data — acolo reincercarea e zgomot curat. Se schimba numai calea de DUPA autentificare.
   */
  const iAuth = ruta.indexOf("if (!tokenOk && !semnaturaOk)");
  const iInbox = ruta.indexOf('from("aboutyou_webhook_inbox")');
  assert.ok(iAuth > 0 && iInbox > iAuth, "autentificarea ramane inaintea inbox-ului");
  assert.match(ruta.slice(iAuth, iAuth + 200), /return ok\(\);/);
});

test("⚠ calea rapida ramane: nu se asteapta cronul", () => {
  /* Fara asta, fiecare expediere ar intarzia pana la un minut degeaba. */
  assert.match(ruta, /await prelucreazaEveniment\(admin, businessId, cfg, event\);/);

  /*
   * ═══ ⚠ SI REUSITA SE MARCHEAZA (27.08.2026) ═══
   *
   * Calea rapida prelucra evenimentul si il lasa neatins in inbox: randul ramanea cu
   * `prelucrat_la` null, deci cronul il lua de la capat la minutul urmator. Fiecare eveniment,
   * prelucrat de doua ori. Ingestul e idempotent, deci nu se pierdea nimic — se cheltuiau insa o
   * recitire a comenzii de la ei si un loc din cele douazeci pe trecere, degeaba.
   *
   * ⚠ DUPA prelucrare, nu inainte: invers, un esec ar fi inchis randul definitiv, adica exact
   * pierderea pe care inbox-ul o inlatura.
   */
  const i = ruta.indexOf("await prelucreazaEveniment(admin, businessId, cfg, event);");
  const j = ruta.indexOf("prelucrat_la: new Date().toISOString()");
  assert.ok(i > 0 && j > i, "marcajul trebuie sa vina DUPA prelucrare");
  /* ⚠ Iar esecul porneste amanarea, altfel cronul ar relua imediat exact ce tocmai a picat. */
  assert.match(ruta, /urmatoarea_incercare: new Date\(Date\.now\(\) \+ amanareInbox\(1\)\)/);
});

test("⚠ o pana lunga nu mai arde toate incercarile in cateva minute", () => {
  /*
   * Cronul trece din minut in minut, deci pragul de zece incercari era zece MINUTE. O pana de un
   * sfert de ora ardea toate incercarile FIECARUI eveniment din inbox si le trimitea pe toate in
   * scrisori moarte — chiar cazul pentru care inbox-ul fusese facut. Iar cauza e comuna: cand ceva
   * pica, pica toate deodata, in aceeasi rulare.
   */
  assert.match(inbox, /export function amanareInbox\(incercari: number\): number/);
  assert.match(inbox, /Math\.min\(60 \* UN_MINUT, UN_MINUT \* 2 \*\* Math\.max\(0, incercari - 1\)\)/);
  /* ⚠ Si selectia chiar sare peste cele amanate: fara asta, amanarea n-ar insemna nimic. */
  assert.match(inbox, /urmatoarea_incercare\.is\.null,urmatoarea_incercare\.lte\./);

  /* Zece incercari inseamna aproape sase ore, nu zece minute. */
  let total = 0;
  for (let k = 1; k <= 10; k++) total += Math.min(60, 2 ** (k - 1));
  assert.ok(total > 300, `zece incercari acopera doar ${total} de minute`);
});

test("⚠ acelasi eveniment livrat de doua ori nu face doua randuri", () => {
  assert.match(ruta, /onConflict: "business_id,event_id", ignoreDuplicates: true/);
  /* ⚠ `id`-ul din plicul lor e cheia; cand lipseste, o amprenta din corp — ca aceeasi livrare sa
     nimereasca acelasi rand, nu unul nou la fiecare reincercare. */
  assert.match(ruta, /function idEvenimentului\(/);
  assert.match(ruta, /createHash\("sha256"\)\.update\(rawBody\)/);
});

test("⚠ cronul reia ce n-a apucat sa fie prelucrat", () => {
  assert.match(cron, /reluate \+= await reiaEvenimenteleNeprelucrate\(admin, businessId, ctx\.config\)/);
  /* ⚠ La fiecare trecere, nu pe tura: un eveniment neprelucrat inseamna o expediere sau o
     anulare care nu s-a intamplat, si aia nu asteapta cinci minute. */
  const i = cron.indexOf("reiaEvenimenteleNeprelucrate");
  const inainte = cron.slice(Math.max(0, i - 400), i);
  assert.doesNotMatch(inainte, /getMinutes\(\) % \d+ ===/);
});

test("⚠ si reluarea are un plafon, cu renuntarea scrisa o singura data", () => {
  /*
   * Un eveniment care nu se poate prelucra niciodata ar fi reluat la fiecare trecere, pentru
   * totdeauna, si ar tine locul celor care chiar se pot rezolva. Iar abandonul in tacere e chiar
   * pierderea pe care inbox-ul o inlatura.
   */
  assert.match(inbox, /const MAX_INCERCARI_INBOX = 10;/);
  assert.match(inbox, /\.lt\("incercari", MAX_INCERCARI_INBOX\)/);
  assert.match(inbox, /if \(incercari >= MAX_INCERCARI_INBOX\)/);
  assert.match(inbox, /severity: "critical"/);
});

test("⚠ prelucrarea sta in biblioteca, nu in ruta", () => {
  /* Importata dintr-o ruta, ar fi tras dupa ea modulul rutei — inclusiv efectele lui de nivel de
     modul. Biblioteca e locul ei. */
  assert.match(inbox, /export async function prelucreazaEveniment\(/);
  assert.match(ruta, /import \{ amanareInbox, prelucreazaEveniment \} from "@\/lib\/aboutyou\/inbox"/);
});
