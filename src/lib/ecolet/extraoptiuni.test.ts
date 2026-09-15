import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extraPentruServiciu, numeExtra, serviciulPoate } from "./extraoptiuni";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTRAOPTIUNILE SE TAIE LA CE POATE SERVICIUL ALES         (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cotarea lor da `form.additional_services`, indexat pe SLUG, cu ce poate fiecare serviciu
 * pentru comanda ASTA. Exemplul din specificatia lor:
 *
 *     "dpd_standard": { "cod": true, "rod": true, "open_package": false }
 *
 * ⚠ CE FACEAM: citeam de acolo NUMAI `cod`. Restul veneau din configul magazinului, o data
 * pentru toate expedierile, si plecau cu `status: true` oricare ar fi fost serviciul ales.
 * Ori emiterea cadea cu un mesaj de nelegat de nimic, ori eColet o ignora tacut: comerciantul
 * credea ca i-a dat cumparatorului dreptul sa deschida coletul, si nu i-l daduse.
 */

/* Chiar exemplul din specificatia lor. */
const DIN_SPEC = {
  dpd_standard: { cod: true, rod: true, open_package: false },
  tnt_express: { cod: true, rod: false, open_package: false },
};

test("⚠⚠ ce spune serviciul ca NU poate nu se mai trimite", () => {
  const r = extraPentruServiciu({ deschidereLaLivrare: true }, DIN_SPEC, "dpd_standard");
  assert.deepEqual(r.deTrimis, {}, "`open_package: false` inseamna ca nu se trimite");
  assert.deepEqual(r.taiate, ["open_package"]);
});

test("⚠⚠ LIPSA cheii nu inseamna „nu poate”", () => {
  /*
   * In exemplul lor, `dpd_standard` are trei chei si nu le are pe `saturday_delivery` sau
   * `sms_notify`. Daca lipsa ar insemna refuz, am fi stins livrarea de sambata pentru servicii
   * care o fac foarte bine, si nimeni n-ar fi aflat de ce. Aceeasi cumpana ca la `PaymentType`
   * al punctelor Cargus: o lipsa tratata ca refuz e un defect TACIT si total.
   */
  const r = extraPentruServiciu(
    { livrareSambata: true, smsNotificare: true }, DIN_SPEC, "dpd_standard",
  );
  assert.deepEqual(r.deTrimis, { livrareSambata: true, smsNotificare: true });
  assert.deepEqual(r.taiate, []);
});

test("⚠ un serviciu despre care nu ni s-a spus nimic pastreaza tot ce s-a cerut", () => {
  const r = extraPentruServiciu(
    { deschidereLaLivrare: true, livrareSambata: true }, DIN_SPEC, "curier_necunoscut",
  );
  assert.deepEqual(r.deTrimis, { deschidereLaLivrare: true, livrareSambata: true });
  assert.deepEqual(r.taiate, []);
});

test("⚠ si cand cotarea n-a intors nimic, nu se taie nimic", () => {
  /* O cotare picata n-are voie sa stinga optiuni pe care comerciantul le-a cerut. */
  for (const fara of [undefined, {}]) {
    const r = extraPentruServiciu({ deschidereLaLivrare: true }, fara, "dpd_standard");
    assert.deepEqual(r.deTrimis, { deschidereLaLivrare: true });
    assert.deepEqual(r.taiate, []);
  }
});

test("ce nu s-a cerut nu se trimite si nu se raporteaza ca taiat", () => {
  const r = extraPentruServiciu({}, DIN_SPEC, "dpd_standard");
  assert.deepEqual(r.deTrimis, {});
  assert.deepEqual(r.taiate, [], "netrimis fiindca n-a fost cerut NU e acelasi lucru cu taiat");

  const stinse = extraPentruServiciu(
    { deschidereLaLivrare: false, livrareSambata: false }, DIN_SPEC, "dpd_standard",
  );
  assert.deepEqual(stinse.taiate, []);
});

test("mai multe taieri deodata se raporteaza toate", () => {
  const strict = { greu: { open_package: false, saturday_delivery: false, sms_notify: false } };
  const r = extraPentruServiciu(
    { deschidereLaLivrare: true, livrareSambata: true, smsNotificare: true }, strict, "greu",
  );
  assert.deepEqual(r.deTrimis, {});
  assert.deepEqual(r.taiate.sort(), ["open_package", "saturday_delivery", "sms_notify"]);
});

test("`serviciulPoate` spune „da” doar cand ei nu spun limpede „nu”", () => {
  assert.equal(serviciulPoate(DIN_SPEC, "dpd_standard", "open_package"), false);
  assert.equal(serviciulPoate(DIN_SPEC, "dpd_standard", "rod"), true);
  assert.equal(serviciulPoate(DIN_SPEC, "tnt_express", "rod"), false);
  assert.equal(serviciulPoate(DIN_SPEC, "dpd_standard", "saturday_delivery"), true, "cheie lipsa");
  assert.equal(serviciulPoate(undefined, "orice", "swap"), true, "fara raspuns");
});

test("fiecare extraoptiune are un nume romanesc, pentru mesajul catre om", () => {
  for (const e of ["open_package", "saturday_delivery", "sms_notify", "rod", "rop", "swap"] as const) {
    const n = numeExtra(e);
    assert.ok(n && n !== e, `${e} n-are nume omenesc`);
  }
});

/* ═══ MUTANTUL STA PE APELANT ═══ */
test("⚠⚠ emiterea chiar reface corpul cu extraoptiunile taiate", () => {
  /*
   * Regula poate fi perfecta si nechemata. Aici se apara CABLAREA: corpul se construieste
   * inainte de validare (ca sa avem cu ce cota), deci trebuie REFACUT dupa ea.
   */
  const sursa = readFileSync(new URL("../actions/ecolet.actions.ts", import.meta.url), "utf8");

  assert.match(sursa, /const \{ deTrimis, taiate \} = extraPentruServiciu\(/,
    "emiterea trebuie sa taie extraoptiunile");
  assert.match(sursa, /corp = corpExpediere\(\{ \.\.\.argumente, servicii: deTrimis(, forma)? \}\)/,
    "corpul trebuie REFACUT cu ce a ramas");
  assert.match(sursa, /let corp = corpExpediere\(argumente\)/,
    "corpul dinaintea validarii pastreaza ce a cerut omul, ca sa se coteze corect");
  /* Si nu in tacere. */
  assert.match(sursa, /action: "ecolet\.extraoptiuni"/, "taierea trebuie strigata in jurnal");
});

test("⚠ se foloseste ACELASI raspuns cerut pentru validare, fara apel in plus", () => {
  const sursa = readFileSync(new URL("../actions/ecolet.actions.ts", import.meta.url), "utf8");
  assert.match(sursa, /raspuns\?\.form\?\.additional_services/,
    "disponibilitatea vine din cotarea deja ceruta");
  /* O a doua cotare ar fi insemnat inca un apel platit pe fiecare emitere. */
  const i = sursa.indexOf("const deIncasat");
  assert.notEqual(i, -1, "blocul de validare nu se mai gaseste");
  const bucata = sursa.slice(i, sursa.indexOf("const admin = createAdminClient()", i));
  assert.equal((bucata.match(/coteaza\(config, corp\)/g) ?? []).length, 1,
    "cotarea dinaintea emiterii se face o singura data");
});
