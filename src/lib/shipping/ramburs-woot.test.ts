import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  STARI_RAMBURS_WOOT, etichetaRambursWoot, eVirat, sumaRambursului, ziuaVirarii,
} from "@/lib/shipping/ramburs-woot";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * RAMBURSUL WOOT: BANII PE DRUMUL INAPOI                         (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Masurat in productie: 199 de comenzi cu ramburs prin Woot, aproape 15.600 lei, si nimic din
 * platforma nu spunea vreodata daca banii au fost virati inapoi.
 *
 * ⚠ AICI HARTA DE STARI E CITATA, NU GHICITA, si asta e chiar deosebirea fata de urmarirea
 * coletului: ei documenteaza `0=Cancelled, 1=Unpicked, 2=Picked up, 3=Paid, 4=External` pe campul
 * `status_id` al schemei `Repayment`. De aceea aici se poate hotari, iar dincolo nu.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. ETICHETELE, EXACT CELE CINCI
   ═══════════════════════════════════════════════════════════════════════════ */

test("cele cinci stari documentate isi au fiecare eticheta", () => {
  assert.deepEqual(Object.keys(STARI_RAMBURS_WOOT).sort(), ["0", "1", "2", "3", "4"]);
  assert.equal(etichetaRambursWoot(0), "Anulat");
  assert.equal(etichetaRambursWoot(1), "Neincasat");
  assert.equal(etichetaRambursWoot(2), "Incasat de curier");
  assert.equal(etichetaRambursWoot(3), "Virat");
  assert.equal(etichetaRambursWoot(4), "Incasat in afara Woot");
});

test("⚠ iar un numar pe care ei NU l-au documentat nu primeste o eticheta inventata", () => {
  /*
   * ⚠ Lista lor poate creste fara sa ne spuna nimeni. O eticheta pusa „ca sa arate ceva" ar
   * minti comerciantul despre banii lui; un rand lipsa il lasa doar sa nu stie, ceea ce e adevarat.
   */
  for (const necunoscut of [5, 9, -1, 1.5]) {
    assert.equal(etichetaRambursWoot(necunoscut), null, `starea ${necunoscut} a primit o eticheta`);
  }
  assert.equal(etichetaRambursWoot(null), null);
  assert.equal(etichetaRambursWoot(undefined), null);
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. ⚠ CE INSEAMNA „BANII AU AJUNS"
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠⚠ numai starea 3 inseamna virat, si NU si 4", () => {
  /*
   * ⚠ HOTARARE LUATA DINADINS. `4=External` e singura din cele cinci al carei inteles nu e limpede
   * din numele lui: „extern" poate insemna incasat pe alt drum, sau virat de altcineva. Socotit
   * drept virare, ar pune bani in pagina de decontari fara ca ei sa fi intrat vreodata in cont.
   */
  assert.equal(eVirat({ status_id: 3 }), true);
  assert.equal(eVirat({ status_id: 4 }), false, "starea „extern” a fost socotita drept virare");
  for (const s of [0, 1, 2]) assert.equal(eVirat({ status_id: s }), false);
  assert.equal(eVirat(null), false);
  assert.equal(eVirat({}), false);
});

test("ziua virarii se ia din ISTORIC, nu din ultima atingere a randului", () => {
  /*
   * ⚠ `updated` e ultima atingere, oricare ar fi ea; ziua virarii e momentul in care starea a
   * DEVENIT 3. Pe un ramburs corectat mai tarziu cele doua difera, iar ziua e CHEIE in tabelul de
   * decontari: ziua gresita face un al doilea rand pentru aceiasi bani.
   */
  const zi = ziuaVirarii({
    status_id: 3,
    updated: "2026-09-20T08:00:00",
    history: [
      { status_id: 1, added: "2026-09-10T09:00:00" },
      { status_id: 3, added: "2026-09-15T10:00:00" },
      { status_id: 2, added: "2026-09-12T14:00:00" },
    ],
  });
  assert.equal(zi, "2026-09-15", "ziua virarii nu vine din istoric");
});

test("⚠ iar cand randul a trecut de doua ori prin starea 3, virarea e PRIMA", () => {
  const zi = ziuaVirarii({
    status_id: 3,
    history: [
      { status_id: 3, added: "2026-09-18T10:00:00" },
      { status_id: 3, added: "2026-09-15T10:00:00" },
    ],
  });
  assert.equal(zi, "2026-09-15");
});

test("fara istoric ramane `updated`, si numai ziua din el", () => {
  assert.equal(ziuaVirarii({ status_id: 3, updated: "2026-09-15T10:00:00" }), "2026-09-15");
  assert.equal(ziuaVirarii({ status_id: 3, updated: "2026-09-15" }), "2026-09-15");
});

test("⚠⚠ si fara nicio zi folosibila NU se inventeaza una", () => {
  /*
   * ⚠ CEA MAI IMPORTANTA DIN FISIER. `transfer_date` inseamna chiar ziua in care au plecat banii.
   * Inlocuita cu „azi", ar fi o data INVENTATA intr-o pagina de bani, iar randul de decontare pur
   * si simplu nu se scrie fara ea.
   */
  assert.equal(ziuaVirarii({ status_id: 3 }), null);
  assert.equal(ziuaVirarii({ status_id: 3, updated: "candva" }), null);
  assert.equal(ziuaVirarii({ status_id: 3, history: [{ status_id: 3, added: "ieri" }] }), null);
  /* Si un ramburs care nu e virat n-are zi de virare, oricat istoric ar avea. */
  assert.equal(ziuaVirarii({ status_id: 2, history: [{ status_id: 3, added: "2026-09-15T10:00:00" }] }), null);
  assert.equal(ziuaVirarii(null), null);
});

test("suma se curata, iar ce nu e suma nu trece", () => {
  assert.equal(sumaRambursului({ value: 150 }), 150);
  assert.equal(sumaRambursului({ value: 150.456 }), 150.46);
  assert.equal(sumaRambursului({ value: 0 }), null);
  assert.equal(sumaRambursului({ value: -5 }), null);
  assert.equal(sumaRambursului({}), null);
  assert.equal(sumaRambursului(null), null);
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. ⚠ GRANITA: SE RECONCILIAZA, NU SE DECLARA PLATIT
   ═══════════════════════════════════════════════════════════════════════════ */

const RAD = process.cwd();

function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const CRON = "src/app/api/cron/woot-repayments/route.ts";

test("⚠⚠ cronul de rambursuri NU atinge `payment_status`", () => {
  /*
   * ⚠ TENTATIA E MARE, si tocmai de aia e pusa plasa: 192 de comenzi Woot stau pe „unpaid", iar
   * „virat" chiar inseamna ca banii au ajuns la comerciant. Dar `payment_status` e si
   * declansatorul facturarii automate: o singura interpretare gresita a rambursului ar emite
   * facturi in lant, pe comenzi pentru care nu s-a incasat nimic.
   */
  const s = sursa(CRON);
  assert.doesNotMatch(s, /payment_status/,
    "cronul de rambursuri a inceput sa declare comenzi platite, ceea ce declanseaza si facturarea");
  assert.doesNotMatch(s, /maybeAutoInvoice/, "cronul de rambursuri a inceput sa emita facturi");
});

test("⚠⚠ decontarile se scriu idempotent, pe cheia naturala", () => {
  /*
   * ⚠ Fereastra e de 60 de zile, deci ACELEASI virari se recitesc in fiecare zi. Cu `insert` in
   * loc de `upsert`, pagina de bani a comerciantului ar aduna aceeasi suma de saizeci de ori.
   */
  const s = sursa(CRON);
  assert.match(s, /courier: "woot"/, "randurile nu mai spun al cui curier sunt");
  assert.match(
    s, /\.upsert\(randuri, \{ onConflict: "business_id,courier,awb_number,transfer_date" \}\)/,
    "decontarile Woot nu se mai scriu idempotent pe cheia naturala",
  );
  assert.doesNotMatch(s, /\.insert\(randuri/, "decontarile au trecut pe `insert`: aceiasi bani s-ar aduna");
});

test("⚠ si cronul e PORNIT, nu doar scris", () => {
  /* O ruta de cron fara rand in `vercel.json` nu ruleaza NICIODATA, si nimic nu se plange. */
  const vercel = JSON.parse(readFileSync(path.join(RAD, "vercel.json"), "utf8")) as
    { crons: { path: string; schedule: string }[] };
  const randul = vercel.crons.find((c) => c.path === "/api/cron/woot-repayments");
  assert.ok(randul, "cronul de rambursuri Woot nu e programat, deci nu ruleaza niciodata");
  /* ⚠ ZILNIC, nu la fiecare ora: virarile se fac in loturi, la zile distanta. */
  assert.match(randul.schedule, /^\d+ \d+ \* \* \*$/,
    `rambursurile Woot nu mai merg zilnic, ci pe „${randul.schedule}”`);
});
