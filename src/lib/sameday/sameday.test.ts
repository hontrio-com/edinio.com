import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idurileExtraOptiunilor, mesajulLor, type SamedayService, type SamedayStareAwb } from "./client";
import { cereOmul, eStareFinala, statusUrmator } from "./statusuri";
import { ETICHETE_COLET, potrivesteTipul, tipulDupaGreutate } from "./colete";

/* ══════════════════════════════════════════════════════════════════════════
   SAMEDAY, DUPA AUDITUL DOCUMENTATIEI v2.3 (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Din 14 rute documentate foloseam 8, din 8 servicii ajungeam la 2, si din 4 extraoptiuni
   la niciuna. Probele de mai jos pazesc ce s-a adaugat — si, unde a fost cazul, ce am
   MASURAT pe contul de productie, fiindca de doua ori nu era ce scria in documentatie.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ── Extraoptiunile ───────────────────────────────────────────────────────── */

const SERVICII: SamedayService[] = [
  {
    id: 7, name: "24H", code: "24", deliveryType: "NextDay",
    optiuni: [
      { taxCode: "PDO", name: "Predare personala in punct fix", id: 674262, tax: 0, packageType: 0 },
      { taxCode: "PDO", name: "Predare personala in punct fix", id: 674263, tax: 0, packageType: 1 },
      { taxCode: "SWAP", name: "Colet la schimb", id: 674253, tax: 0, packageType: 0 },
    ],
  },
  {
    id: 15, name: "Locker NextDay", code: "LN", deliveryType: "NextDay",
    optiuni: [
      { taxCode: "PDO", name: "Predare personala in punct fix", id: 690892, tax: -1, packageType: 0 },
    ],
  },
];

test("⚠ acelasi cod are ALT id pe alt serviciu — masurat pe cont real", () => {
  /*
   * Cifrele astea nu sunt inventate: sunt exact ce a intors contul de productie. „Predare
   * personala in punct fix" e 674262 pe 24H si 690892 pe Locker NextDay, la acelasi tip de
   * colet. Un id imprumutat de la alt serviciu e un id strain, si de-aia NU se poate scrie
   * niciunul in cod.
   */
  assert.deepEqual(idurileExtraOptiunilor(SERVICII, 7, 0, ["PDO"]).ids, [674262]);
  assert.deepEqual(idurileExtraOptiunilor(SERVICII, 15, 0, ["PDO"]).ids, [690892]);
});

test("⚠ si ALT id pe alt tip de colet", () => {
  assert.deepEqual(idurileExtraOptiunilor(SERVICII, 7, 1, ["PDO"]).ids, [674263]);
});

test("⚠ un cod pe care contul nu-l are se SARE, si se spune care", () => {
  /* Contul poate sa n-aiba extraoptiunea activata — se cere la Sameday, pe contract, nu prin
     API. Coletul tot trebuie sa plece; dar tacerea ar fi insemnat ca omul crede ca a cerut
     ceva ce nu s-a cerut niciodata. */
  const r = idurileExtraOptiunilor(SERVICII, 15, 0, ["PDO", "SWAP"]);
  assert.deepEqual(r.ids, [690892]);
  assert.deepEqual(r.negasite, ["SWAP"]);
});

test("un serviciu necunoscut nu arunca, doar nu gaseste nimic", () => {
  const r = idurileExtraOptiunilor(SERVICII, 999, 0, ["PDO"]);
  assert.deepEqual(r.ids, []);
  assert.deepEqual(r.negasite, ["PDO"]);
});

/* ── Mesajul lor de eroare ────────────────────────────────────────────────── */

test("⚠ eroarea lor e IMBRICATA, si asa se citeste", () => {
  /*
   * Masurat pe productie: un AWB inexistent intoarce
   * `{"error":{"code":404,"message":"Awb-ul nu a fost gasit!"}}`.
   * Codul dinainte cauta `data.error` ca SIR, deci pe forma asta ramanea cu `undefined` si
   * comerciantul primea un mesaj gol exact cand avea nevoie de unul.
   */
  assert.equal(
    mesajulLor({ error: { code: 404, message: "Awb-ul nu a fost gasit!" } }),
    "Awb-ul nu a fost gasit!",
  );
  /* Si forma simpla, ca sa nu se strice ce mergea. */
  assert.equal(mesajulLor({ error: "ceva" }), "ceva");
  assert.equal(mesajulLor({ message: "altceva" }), "altceva");
  assert.equal(mesajulLor({}), null);
  assert.equal(mesajulLor(null), null);
});

/* ── Statusurile ──────────────────────────────────────────────────────────── */

const stare = (p: Partial<SamedayStareAwb>): SamedayStareAwb => ({
  livrat: false, anulat: false, livratLa: null, incercariDeLivrare: 0,
  statusId: null, eticheta: "", motiv: null, locatie: null, brut: {}, ...p,
});

test("livrat ridica comanda pe livrat", () => {
  assert.equal(statusUrmator("shipped", stare({ livrat: true })), "delivered");
  assert.equal(statusUrmator("processing", stare({ livrat: true })), "delivered");
});

test("in drum, dar nelivrat, inseamna expediat", () => {
  assert.equal(statusUrmator("processing", stare({})), "shipped");
});

test("⚠ nu se coboara NICIODATA", () => {
  /* Evenimentele pot sosi in alta ordine. O comanda deja livrata nu se intoarce la expediat. */
  assert.equal(statusUrmator("delivered", stare({})), null);
});

test("⚠ o comanda anulata sau rambursata nu se misca de la un transportator", () => {
  assert.equal(statusUrmator("cancelled", stare({ livrat: true })), null);
  assert.equal(statusUrmator("refunded", stare({ livrat: true })), null);
});

test("⚠ anularea la ei NU coboara comanda, doar se semnaleaza", () => {
  /*
   * Un AWB anulat poate insemna ca s-a reemis altul (adresa gresita, colet pierdut).
   * Coborand comanda, am sterge o expediere care poate chiar a plecat.
   */
  assert.equal(statusUrmator("shipped", stare({ anulat: true })), null);
  assert.match(String(cereOmul(stare({ anulat: true }))), /anulat/i);
});

test("⚠ trei incercari de livrare cer un om; doua sunt inca rutina", () => {
  assert.equal(cereOmul(stare({ incercariDeLivrare: 2 })), null);
  assert.match(String(cereOmul(stare({ incercariDeLivrare: 3 }))), /de 3 ori/);
});

test("⚠ livrarea NU se semnaleaza", () => {
  /* Se vede in panou si nu cere nimic de la nimeni. Un rand de jurnal la fiecare colet livrat
     ar ineca exact semnalele pentru care exista jurnalul. */
  assert.equal(cereOmul(stare({ livrat: true })), null);
});

test("livrat sau anulat inseamna incheiat", () => {
  assert.equal(eStareFinala(stare({ livrat: true })), true);
  assert.equal(eStareFinala(stare({ anulat: true })), true);
  assert.equal(eStareFinala(stare({})), false);
});

/* ── Tipul coletului ──────────────────────────────────────────────────────── */

test("⚠ tipul coletului se ia din GREUTATE, cum il imparte Sameday", () => {
  assert.equal(tipulDupaGreutate(0.5), 1);
  assert.equal(tipulDupaGreutate(1), 1);
  assert.equal(tipulDupaGreutate(1.01), 0);
  assert.equal(tipulDupaGreutate(38), 0);
  assert.equal(tipulDupaGreutate(38.1), 2);
});

test("⚠ un colet de 50 kg nu mai poate pleca declarat tip 0", () => {
  /* Pana azi fereastra lasa orice combinatie, iar ei taxeaza dupa ce declaram noi.
     Nepotrivirea se vedea abia pe factura lor, cand nu mai avea cine s-o repare. */
  const m = potrivesteTipul(50, 0);
  assert.ok(m, "trebuie sa spuna ceva");
  assert.match(m!, /Colet mare/, "si sa spuna CE sa apese, nu doar ca a gresit");
  assert.equal(potrivesteTipul(50, 2), null);
});

test("⚠ eticheta tipului 1 nu mai spune „Plic”", () => {
  /* Nu scrie nicaieri la ei, iar un comerciant cu o cutie de 800 g o citea drept
     „nu e cazul meu". */
  assert.match(ETICHETE_COLET[1], /pana in 1 kg/);
  assert.doesNotMatch(Object.values(ETICHETE_COLET).join(" "), /Plic/i);
});

/* ── Legaturile din cod ───────────────────────────────────────────────────── */

test("⚠ e-mailul destinatarului chiar pleaca", () => {
  /* La un colet lasat intr-un dulap nu vine niciun curier care sa sune la usa: codul de
     deschidere ajunge la om pe e-mail. Ambele exemple de locker din documentatia lor il
     poarta, si noi nu-l trimiteam deloc. */
  const c = viu("src/lib/sameday/client.ts");
  assert.match(c, /awbRecipient\[email\]/);
  const a = viu("src/lib/actions/sameday.actions.ts");
  assert.match(a, /recipientEmail: input\.recipientEmail \?\? \(order\.customer_email/);
});

test("⚠ ridicarea de la tert exista, deci retururile sunt posibile", () => {
  /* `thirdPartyPickup=0` era scris fix, in ambele locuri — deci serviciile de retur erau de
     NEATINS, nu doar nefolosite. */
  const c = viu("src/lib/sameday/client.ts");
  assert.match(c, /thirdPartyPickup=1/);
  assert.match(c, /thirdParty\[name\]/);
  assert.match(c, /lockerFirstMile=/);
  assert.match(c, /returnLockerParcel\[eligibilityDate\]/);
});

test("⚠ `serviceTaxes` pleaca drept ID-URI, ca in SDK-ul lor", () => {
  /* Documentatia arata doua forme care nu se potrivesc intre ele: `["SWAP"]` intr-un exemplu
     si `"PDO 123456"` in altul. SDK-ul lor oficial trimite id-uri, si aia e forma dovedita. */
  const c = viu("src/lib/sameday/client.ts");
  assert.match(c, /serviceTaxes\[\$\{i\}\]=\$\{id\}/);
});

test("⚠ moneda nu mai e scrisa fix pe RON", () => {
  /* Cu `RON` in cod, toate serviciile crossborder erau inchise: ei cer moneda tarii de
     destinatie. */
  const c = viu("src/lib/sameday/client.ts");
  assert.match(c, /currency=\$\{enc\(input\.currency \?\? "RON"\)\}/);
});

test("⚠ lockerele se cer cate 500, implicitul LOR", () => {
  /* Masurat pe cont real: 7.021 de lockere. Cu 100 pe pagina insemna 71 de cereri una dupa
     alta inainte ca omul sa vada harta. */
  /* ⚠ Se citeste NUMAI corpul lui `getSamedayLockers`: `countPerPage: "100"` e legitim la
     servicii, care sunt douazeci si doua. O verificare pe tot fisierul ar fi cazut pe cod bun
     — a doua oara azi cand o cautare prea larga imi arata altceva decat caut. */
  const c = viu("src/lib/sameday/client.ts");
  const i = c.indexOf("export async function getSamedayLockers");
  assert.ok(i > 0, "functia exista");
  const corp = c.slice(i, c.indexOf("export ", c.indexOf("return allLockers;", i)));
  assert.match(corp, /countPerPage: "500"/);
  assert.doesNotMatch(corp, /countPerPage: "100"/);
});

test("⚠ raspunsul de la emitere se pastreaza intreg", () => {
  /* Citeam `awbNumber` si aruncam restul — inclusiv `awbCost`, singurul loc din care aflam
     cat a costat CHIAR transportul, si `lockerReturnChargeCode`, pe care ei il dau O SINGURA
     DATA si fara de care cumparatorul nu-si mai poate preda returul. */
  const c = viu("src/lib/sameday/client.ts");
  for (const camp of ["awbCost", "pdfLink", "returnAwbs", "lockerReturnChargeCode", "brut: data"]) {
    assert.match(c, new RegExp(camp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), camp);
  }
  const a = viu("src/lib/actions/sameday.actions.ts");
  assert.match(a, /sameday_awb_cost = creat\.awbCost/);
  assert.match(a, /sameday_locker_charge_code = creat\.lockerReturnChargeCode/);
});

test("⚠ comerciantul poate alege easybox-ul la emitere, nu doar cumparatorul la checkout", () => {
  /*
   * Asta a fost intrebarea de la care a pornit tot: „poate, cand genereaza AWB-ul, sa puna
   * coletul la Locker?". Pana azi nu putea — lockerul se citea DOAR din comanda.
   */
  const a = viu("src/lib/actions/sameday.actions.ts");
  assert.match(a, /const locker = input\.lockerAles \?\? lockerDinComanda;/,
    "alegerea comerciantului bate comanda");
  const m = viu("src/components/dashboard/SamedayAwbModal.tsx");
  assert.match(m, /setLaEasybox\(e\.target\.checked\)/, "si exista un comutator");
  assert.match(m, /getLockers\(businessId, "sameday"\)/, "si un selector care chiar cere lista");
});

test("⚠ cronul de urmarire exista si e programat", () => {
  /* Sameday era singurul curier din doisprezece fara urmarire. */
  const cron = viu("src/app/api/cron/sameday-tracking/route.ts");
  assert.match(cron, /statusuriPeIntervalSameday/, "pasul ieftin, o cerere pe magazin");
  assert.match(cron, /statusAwbSameday/, "si apelul amanuntit doar pentru cine s-a miscat");
  assert.match(cron, /sameday_status_checked_at", \{ ascending: true, nullsFirst: true \}/,
    "rotatia: cele neintrebate de cel mai mult timp intai");

  const vercel = readFileSync("vercel.json", "utf8");
  assert.match(vercel, /"\/api\/cron\/sameday-tracking"/, "altfel nu ruleaza niciodata");
});

test("⚠ o citire picata nu raporteaza „zero de verificat”", () => {
  /* Fara `error` destructurat, cronul ar raspunde `ok: true, verificate: 0` — o rulare
     sanatoasa la vedere, care n-a urmarit nimic. */
  const cron = viu("src/app/api/cron/sameday-tracking/route.ts");
  assert.match(cron, /if \(eComenzi\) \{[\s\S]{0,400}?status: 503/);
  assert.match(cron, /if \(eCfg\) \{[\s\S]{0,400}?status: 503/);
});

test("⚠ cand pasul ieftin pica, se intreaba TOTI", () => {
  /* O optimizare care se strica n-are voie sa devina o urmarire care nu mai vede nimic. */
  const cron = viu("src/app/api/cron/sameday-tracking/route.ts");
  assert.match(cron, /miscate\.set\(businessId, null\)/);
  assert.match(cron, /if \(setMiscate && !nicicandIntrebata && !setMiscate\.has\(/);
});
