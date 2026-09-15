import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corpExpediere, MAX_COLETE_ECOLET, type DateExpediere } from "./expediere";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * FORMA COLETULUI VINE DE LA EI, NU E SCRISA FIX            (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `parcel.shape` trimitea mereu „standard", scris fix in cod. Dar cotarea lor intoarce
 * `form.is_standard`, indexat pe slug, care spune pentru care servicii comanda ASTA are
 * dimensiuni standard, iar `form.info` chiar explica: „Parcel length is non standard (75)".
 *
 * ⚠ Declarat „standard" pentru un colet pe care EI il socotesc nestandard, coletul se
 * retarifeaza la depozit, iar diferenta o plateste comerciantul.
 */

const ADRESA = {
  nume: "Test", companie: "", strada: "Str. Test", numar: "1", oras: "Cluj-Napoca",
  judet: "Cluj", codPostal: "400000", telefon: "0722222222", email: "a@b.ro", localityId: 123,
};

const date = (peste: Partial<DateExpediere> = {}): DateExpediere => ({
  expeditor: ADRESA, destinatar: ADRESA, greutateKg: 2, ...peste,
});

test("fara nicio vorba de la ei, forma ramane „standard”", () => {
  /* Purtarea de pana la 15.09.2026: nu se schimba nimic pentru cine n-a aflat altceva. */
  assert.equal(corpExpediere(date()).parcel.shape, "standard");
  assert.equal(corpExpediere(date({ forma: undefined })).parcel.shape, "standard");
});

test("⚠⚠ cand EI spun ca e nestandard, asa pleaca", () => {
  assert.equal(corpExpediere(date({ forma: "nonstandard" })).parcel.shape, "nonstandard");
});

test("⚠ plafonul de colete e al LOR: `minimum: 1, maximum: 10`", () => {
  /* Scris in specificatie pe `parcel.amount`. Netaiat, un numar mai mare pleca si cadea la ei
     cu un mesaj pe care comerciantul nu-l poate lega de nimic. */
  assert.equal(MAX_COLETE_ECOLET, 10);
  assert.equal(corpExpediere(date({ numarColete: 25 })).parcel.amount, 10);
  assert.equal(corpExpediere(date({ numarColete: 10 })).parcel.amount, 10);
  assert.equal(corpExpediere(date({ numarColete: 3 })).parcel.amount, 3);
});

test("⚠ si podeaua: zero, fractie sau lipsa dau tot un colet", () => {
  for (const rau of [0, -3, 0.5, Number.NaN, undefined]) {
    assert.equal(corpExpediere(date({ numarColete: rau as number })).parcel.amount, 1, String(rau));
  }
});

/* ═══ MUTANTUL STA PE APELANT ═══ */
test("⚠⚠ emiterea ia forma din RASPUNSUL LOR, si doar cand spun limpede „nu”", () => {
  const sursa = readFileSync(new URL("../actions/ecolet.actions.ts", import.meta.url), "utf8");

  assert.match(
    sursa,
    /raspuns\?\.form\?\.is_standard\?\.\[aleasa\.slug\] === false/,
    "forma trebuie luata din `is_standard`, pe slugul ales",
  );
  assert.match(sursa, /corpExpediere\(\{ \.\.\.argumente, servicii: deTrimis, forma \}\)/,
    "corpul trebuie refacut cu forma aflata de la ei");
  /*
   * ⚠ Cheia LIPSA nu inseamna „nestandard": ar fi trecut fiecare colet pe tariful scump.
   * Comparatia stricta cu `false` e chiar regula.
   */
  assert.ok(
    !/is_standard\?\.\[aleasa\.slug\] !== true/.test(sursa),
    "`!== true` ar face nestandard si coletele despre care ei nu spun nimic",
  );
});

test("⚠ schimbarea formei se STRIGA: acolo se schimba pretul", () => {
  const sursa = readFileSync(new URL("../actions/ecolet.actions.ts", import.meta.url), "utf8");
  assert.match(sursa, /action: "ecolet\.forma"/, "trebuie sa lase urma in jurnal");
  assert.match(sursa, /raspuns\?\.form\?\.info/, "si sa duca mai departe explicatia LOR");
});

test("⚠ forma nu se atinge cand nu e nimic de schimbat", () => {
  /* Plasa care apara reparatia de exces: corpul se reface doar cand chiar s-a schimbat ceva,
     ca sa nu se piarda nimic din ce a cerut omul. */
  const sursa = readFileSync(new URL("../actions/ecolet.actions.ts", import.meta.url), "utf8");
  assert.match(sursa, /if \(taiate\.length > 0 \|\| forma\) \{/,
    "refacerea corpului trebuie sa fie conditionata");
});
