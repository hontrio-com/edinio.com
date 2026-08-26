import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asteaptaHotarare, marfaAAjuns, sePoateHotari, STARI_DE_HOTARAT } from "./retur-forma";

/* ══════════════════════════════════════════════════════════════════════════
   `Created` NU INSEAMNA „AȘTEAPTĂ RĂSPUNSUL TĂU" (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Definitiile lor, cuvant cu cuvant, din ghid:

     Created         „The first status of the orders returns. This occurs when the customer
                      presses the return button."
     WaitingInAction „This statu returns when the returned orders reaches the supplier."

   ⚠ DEOSEBIREA E FIZICA, nu de eticheta: pe `Created` clientul abia a apasat butonul si coletul
   e inca la el. Comerciantul n-are ce hotari despre marfa pe care n-a primit-o — si mai ales
   n-are cum sa spuna „am primit marfa si e buna".
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ doar `WaitingInAction` asteapta o apasare de-a comerciantului", () => {
  assert.deepEqual([...STARI_DE_HOTARAT], ["WaitingInAction"]);
  assert.equal(asteaptaHotarare("WaitingInAction"), true);
  /* ⚠ Marfa nu a ajuns inca la el. */
  assert.equal(asteaptaHotarare("Created"), false);
  /* ⚠ Acolo se uita EI. */
  assert.equal(asteaptaHotarare("InAnalysis"), false);
  for (const s of ["Accepted", "Rejected", "Cancelled", "Unresolved", null]) {
    assert.equal(asteaptaHotarare(s), false, `${s}`);
  }
});

test("⚠ hotararea se opreste doar pe cele SIGUR gresite", () => {
  /*
   * ⚠ Ghidul lor NU spune ca aprobarea se poate face doar din `WaitingInAction` — verificat, nu
   * presupus — asa ca nici noi n-o spunem. Oprite, l-am fi blocat pe comerciant pe baza unei
   * reguli pe care ei n-au scris-o.
   */
  for (const s of ["WaitingInAction", "InAnalysis", "Unresolved", "WaitingFraudCheck", null]) {
    assert.equal(sePoateHotari(s), true, `${s} trebuie sa treaca`);
  }
  /* Marfa nu a ajuns, sau s-a hotarat deja — si nu de aici. */
  for (const s of ["Created", "Accepted", "Rejected", "Cancelled"]) {
    assert.equal(sePoateHotari(s), false, `${s} trebuie oprit`);
  }
});

test("⚠ si oprirea e pe SERVER, inaintea apelului ireversibil", () => {
  /*
   * ⚠ CURSA E ADEVARATA: ecranul arata `WaitingInAction` la 10:00, Trendyol accepta singur la
   * 10:01, omul apasa „Respinge" la 10:02. Ghidul lor spune ca rezultatul unei respingeri se
   * urmareste ABIA pe urma, pe `claimItemStatus` — deci nici n-am fi aflat pe loc ca n-a prins.
   */
  const mod = viu("src/lib/trendyol/retururi.ts");
  assert.match(mod, /select\("claim_item_id, claim_item_status"\)/);
  assert.match(mod, /!sePoateHotari\(stari\.get\(id\)\)/);

  const i = mod.indexOf("sePoateHotari(stari.get(id))");
  for (const apel of ["approveClaimItems(", "rejectClaimItems("]) {
    assert.ok(mod.indexOf(apel) > i, `verificarea trebuie sa fie inaintea lui ${apel}`);
  }
});

test("⚠ repunerea in stoc cere ca marfa sa fi AJUNS", () => {
  /*
   * Butonul spune „Am primit marfa și e bună", dar nimic nu verifica asta: functia se uita doar
   * la `repus_in_stoc_la`. Apasat pe `Created`, stocul creste pentru marfa care nu e la raft —
   * si se vinde ce nu exista.
   *
   * ⚠ MASURAT pe RPC-ul adevarat, in tranzactie anulata, pe o listare adevarata:
   *     Created         -> {stare: "marfa-n-a-ajuns", pus: 0}
   *     WaitingInAction -> {stare: "pus", pus: 1}
   *     ...a doua oara  -> {stare: "deja", pus: 0}      (idempotenta se pastreaza)
   *     Accepted        -> {stare: "pus", pus: 1}
   */
  assert.equal(marfaAAjuns("Created"), false);
  for (const s of ["WaitingInAction", "InAnalysis", "Accepted", "Rejected", "Unresolved", null]) {
    assert.equal(marfaAAjuns(s), true, `${s}`);
  }

  /* ⚠ Si paza sta in RPC, nu in ecran: butonul se poate ocoli cu un POST direct, functia nu. */
  const mig = readFileSync("migrations/2026-11-11-repunerea-cere-marfa-ajunsa.sql", "utf8");
  assert.match(mig, /v_linie\.claim_item_status = 'Created' or v_stare_cerere = 'Created'/);
  assert.match(mig, /'stare', 'marfa-n-a-ajuns'/);

  /* ⚠ Si mesajul spune DE CE si CAND se poate, nu doar ca nu merge. */
  const mod = readFileSync("src/lib/trendyol/retururi.ts", "utf8");
  assert.match(mod, /case "marfa-n-a-ajuns"/);
  assert.match(mod, /după ce o primești/);
});

test("⚠ la podea se citeste pana la capatul pe care il spun EI", () => {
  /*
   * ⚠ PIERDEREA NU SE FACE MAI PUTIN PROBABILA, SE FACE INACCESIBILA. La podea nu se mai poate
   * ingusta, deci raman trei purtari: sa stai pe loc (se pierde TOT, de-acum inainte), sa treci
   * mai departe (se pierde coada), sau sa citesti pana la capat. `totalPages` vine in fiecare
   * raspuns — deci capatul nu se ghiceste, se citeste.
   *
   * Ce ramane: 200 de pagini a 50 inseamna 10.000 de cereri intr-o fereastra de CINCI MINUTE la
   * un singur magazin, adica 120.000 pe ora.
   */
  const mod = viu("src/lib/trendyol/retururi.ts");
  assert.match(mod, /const PAGINI_MAXIME_LA_PODEA = 200;/);
  assert.match(mod, /if \(laStramtoare && totalPagini > paginiDeCitit\) \{/);
  assert.match(mod, /paginiDeCitit = Math\.min\(totalPagini, PAGINI_MAXIME_LA_PODEA\);/);
  /* ⚠ `let`, nu `const`: bucla se intinde dupa ce afla cat e de citit. */
  assert.match(mod, /let paginiDeCitit = laStramtoare/);
});
