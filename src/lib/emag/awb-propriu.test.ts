import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { awbPropriuAlComenzii, paginaAwb, cheiaPdfAwb, CAMPURI_AWB_DE_CITIT } from "./awb-propriu";

/* ══════════════════════════════════════════════════════════════════════════
   AWB-UL CURIERULUI PROPRIU AJUNGE SI LA eMAG (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Panoul spunea „poți expedia cu curierul tău, eMAG le acceptă pe amândouă". Adevarat
   despre ei — dar Edinio nu inchidea bucla: dupa un AWB emis cu curierul magazinului,
   NIMIC nu-i trimitea numarul lui eMAG.

   ⚠ La ei NU exista camp de AWB pe comanda — citit din schema lor, `OrderSave` are 22 de
   campuri si niciunul nu e `awb`. Singura cale e atasamentul `type = 10`, cu un `.pdf`.
*/

test("ia primul AWB gasit, in ordinea listei", () => {
  assert.deepEqual(
    awbPropriuAlComenzii({ fan_courier_awb_number: "2100000123456" }),
    { awb: "2100000123456", curier: "FAN Courier" },
  );
  assert.equal(awbPropriuAlComenzii({}), null);
  assert.equal(awbPropriuAlComenzii(null), null);
});

test("⚠ un sir gol sau numai spatii NU e un AWB", () => {
  /* Se intampla: o coloana atinsa si golita. Trimis asa, atasamentul ar fi purtat „AWB: ". */
  assert.equal(awbPropriuAlComenzii({ gls_awb_number: "   " }), null);
  assert.equal(awbPropriuAlComenzii({ gls_awb_number: "" }), null);
  /* ⚠ Dar un numar CHIAR e un AWB, doar ca vine ca numar din baza. */
  assert.deepEqual(
    awbPropriuAlComenzii({ dpd_awb_number: 9912345 as unknown as string }),
    { awb: "9912345", curier: "DPD" },
  );
});

test("⚠ numele venit de la furnizor bate eticheta noastra", () => {
  /*
   * La intermediari numarul e emis de un curier de dedesubt, iar clientul acolo il
   * urmareste. Scris „Innoship", omul ar fi cautat pe un site care nu-l stie.
   */
  assert.deepEqual(
    awbPropriuAlComenzii({ innoship_awb_number: "IN123", innoship_courier_name: "Cargus" }),
    { awb: "IN123", curier: "Cargus" },
  );
  /* Fara numele lor, se cade pe eticheta noastra. */
  assert.deepEqual(
    awbPropriuAlComenzii({ smartship_awb_number: "SS9", smartship_courier_name: "  " }),
    { awb: "SS9", curier: "SmartShip" },
  );
});

test("⚠ `tracking_number` sta la URMA", () => {
  /* E campul generic, in care se poate scrie orice de mana — deci cel mai putin sigur. Dar
     ramane in lista: un comerciant care si-a trecut numarul acolo tot vrea sa ajunga. */
  assert.deepEqual(
    awbPropriuAlComenzii({ tracking_number: "X1", sameday_awb_number: "S1" }),
    { awb: "S1", curier: "Sameday" },
    "curierul cunoscut bate campul generic",
  );
  assert.deepEqual(
    awbPropriuAlComenzii({ tracking_number: "X1" }),
    { awb: "X1", curier: "curierul magazinului" },
  );
});

test("⚠ FIECARE coloana din lista exista chiar pe `orders`", () => {
  /*
   * Proba cea mai importanta din fisier, si inlocuitorul verificarii de tipuri.
   *
   * Sirul de `select` din cron e compus din `CAMPURI_AWB_DE_CITIT`, iar tipurile PostgREST
   * nu pot citi un sablon — deci acolo se face un `as unknown as`. Verificarea nu se
   * pierde, se muta aici, si e MAI TARE: se uita in tipurile generate DIN SCHEMA, deci
   * prinde si o coloana redenumita in baza.
   *
   * ⚠ O coloana care nu exista ar face PostgREST sa refuze intreaga interogare, iar pasul
   * s-ar intoarce cu zero — tacut, ca de fiecare data.
   */
  const tipuri = readFileSync("src/types/database.types.ts", "utf8");
  const iOrders = tipuri.indexOf("      orders: {");
  assert.ok(iOrders > 0, "blocul `orders` nu s-a gasit in tipuri");
  const bloc = tipuri.slice(iOrders, tipuri.indexOf("      Insert:", iOrders));

  for (const camp of CAMPURI_AWB_DE_CITIT.split(", ")) {
    assert.ok(
      new RegExp(`^\\s+${camp}:`, "m").test(bloc),
      `coloana \`${camp}\` nu exista pe \`orders\``,
    );
  }
});

test("cheia din R2 nu poarta semne din numarul de AWB", () => {
  /* ⚠ Numarul ajunge intr-o cale de fisier; un `/` acolo ar fi facut alt dosar. */
  assert.equal(
    cheiaPdfAwb("biz", "ord", "AB/12 34"),
    "awb-emag/biz/ord-AB1234.pdf",
  );
});

/* ── Pagina care pleaca la ei ─────────────────────────────────────────────── */

test("pagina poarta curierul, numarul si comanda", () => {
  const p = paginaAwb({ awb: "2100000123456", curier: "FAN Courier" }, "EMAG-407112233")
    .toString("latin1");
  assert.match(p, /\(Curier: FAN Courier\) Tj/);
  assert.match(p, /\(AWB: 2100000123456\) Tj/);
  assert.match(p, /\(Comanda: EMAG-407112233\) Tj/);
});

test("⚠ pagina spune ce ESTE, ca sa nu fie luata drept eticheta curierului", () => {
  /*
   * Nu e eticheta lui — aia ar cere cincisprezece integrari separate. Un cumparator care
   * primeste o pagina si crede ca e eticheta ar incerca s-o foloseasca la ghiseu.
   */
  const p = paginaAwb({ awb: "1", curier: "GLS" }, "EMAG-1").toString("latin1");
  assert.match(p, /Document informativ/);
});

test("⚠ un nume de curier cu paranteze nu rupe documentul", () => {
  /* `Sameday (locker)` e un nume adevarat din lista lor. */
  const p = paginaAwb({ awb: "1", curier: "Sameday (locker)" }, "EMAG-1").toString("latin1");
  assert.match(p, /\(Curier: Sameday \\\(locker\\\)\) Tj/);
  assert.ok(p.startsWith("%PDF-1.4"), "documentul a ramas intreg");
});

/* ── Si legatura din cron ─────────────────────────────────────────────────── */

test("⚠ un AWB emis PRIN eMAG nu se trimite inapoi la ei", () => {
  /*
   * Altfel comanda ar primi un al doilea document pentru acelasi transport, iar
   * cumparatorul ar vedea doua AWB-uri si n-ar sti pe care sa-l urmareasca.
   */
  const cron = readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(cron, /from\("emag_awb"\)[\s\S]{0,200}?eq\("awb_number", awb\.awb\)/);
});

test("⚠ fara AWB se stampileaza — dar NUMAI fiindca intrebarea se redeschide", () => {
  /*
   * ═══ PROBA ASTA CEREA PE DOS PANA PE 25.08.2026, SI AVEA DREPTATE ATUNCI ═══
   *
   * Textul ei spunea: „comanda poate fi inca nepregatita; marcata, n-ar mai fi privita cand
   * chiar apare un numar”. Adevarat — CAT TIMP trecerea cauta `awb_uploaded_at is null`.
   * Sub filtrul acela, stampila era o usa care se inchidea pe veci.
   *
   * ═══ CE S-A SCHIMBAT ═══
   *
   * Filtrul acela era el insusi defectul: un AWB REEMIS nu mai ajungea niciodata la eMAG,
   * fiindca dupa prima urcare campul e scris si comanda iese din bazin pentru totdeauna.
   * Acum se intreaba `emag_comenzi_de_verificat_awb`, care redeschide comanda la orice
   * atingere (`o.updated_at > eo.awb_uploaded_at`).
   *
   * ═══ SI DE-ABIA ATUNCI stampila e nu doar ingaduita, ci NECESARA ═══
   *
   * Nestampilata, o comanda neexpediata ar fi recitita la fiecare trecere, iar teancul creste
   * cu fiecare comanda care asteapta — lucrul nou ar astepta in spatele lui.
   *
   * ⚠ CELE DOUA JUMATATI NU SE POT DESPARTI, si de aceea stau in aceeasi proba: stampila
   * fara redeschidere pierde AWB-uri; redeschiderea fara stampila infunda teancul. Cine
   * scoate una din ele trebuie sa dea socoteala si pentru cealalta.
   */
  const cron = readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  /* Jumatatea intai: se stampileaza, si fara numar. */
  const i = cron.indexOf("if (!awb) {");
  assert.ok(i > 0, "ramura fara AWB exista");
  const ramura = cron.slice(i, cron.indexOf("continue;", i));
  assert.match(ramura, /awb_uploaded_at: acum\(\)/, "se stampileaza");
  assert.doesNotMatch(ramura, /awb_uploaded_number/, "dar numarul ramane gol");

  /* Jumatatea a doua, fara de care prima e o pierdere tacuta de AWB-uri. */
  assert.match(cron, /rpc\("emag_comenzi_de_verificat_awb"/, "intrebarea care redeschide");
  const mig = readFileSync("migrations/2026-10-16-awb-reemis.sql", "utf8");
  assert.match(mig, /o\.updated_at > eo\.awb_uploaded_at/, "si chiar redeschide la atingere");
});

test("⚠ un esec dovedit NU marcheaza comanda ca rezolvata", () => {
  const cron = readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const i = cron.indexOf('} else if (rez.fel === "esuat") {');
  assert.ok(i > 0, "ramura de esec exista");
  const ramura = cron.slice(i, i + 600);
  assert.doesNotMatch(ramura, /awb_uploaded_at/, "esecul nu marcheaza");
  assert.match(ramura, /logError\(/, "dar se scrie");
});
