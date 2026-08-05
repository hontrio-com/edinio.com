import test from "node:test";
import assert from "node:assert/strict";

import {
  adaugaSesiune,
  claimuriDinToken,
  listaSesiuni,
  MAX_SESIUNI_CONFIRMATE,
  sesiuneNeconfirmata,
  VIATA_CONFIRMARE_MS,
} from "./mfa";

import { desigileazaSesiune, sigileazaSesiune } from "./sesiune-asteptare";

// Cheia se citeste la APEL, nu la incarcarea modulului, deci e destul sa fie
// pusa aici.
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "cheie-de-test-doar-pentru-testul-asta";

/**
 * Testele de aici acopera exact deciziile care, gresite, redeschid gaura din
 * 05.08.2026: „codul a expirat" nu are voie sa insemne „liber", iar sigiliul cu
 * tokenurile nu are voie sa fie nici citibil, nici modificabil de cine il tine
 * in browser.
 */

function tokenFals(corp: Record<string, unknown>): string {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
  return `${b64(JSON.stringify({ alg: "HS256" }))}.${b64(JSON.stringify(corp))}.semnatura`;
}

test("claimuriDinToken scoate sub si session_id", () => {
  const c = claimuriDinToken(tokenFals({ sub: "u1", session_id: "s1" }));
  assert.deepEqual(c, { sub: "u1", session_id: "s1" });
});

test("claimuriDinToken suporta diacritice in corp (UTF-8, nu latin1)", () => {
  const c = claimuriDinToken(tokenFals({ sub: "u1", session_id: "s1", nume: "Ștefan Ionuț" }));
  assert.equal(c?.session_id, "s1");
});

test("claimuriDinToken refuza ce nu e token", () => {
  assert.equal(claimuriDinToken(null), null);
  assert.equal(claimuriDinToken("nu.e"), null);
  assert.equal(claimuriDinToken(tokenFals({ sub: "u1" })), null, "fara session_id");
  assert.equal(claimuriDinToken(tokenFals({ session_id: "s1" })), null, "fara sub");
});

test("fara MFA nu se schimba nimic: sesiunea trece", () => {
  assert.equal(sesiuneNeconfirmata({ mfa_email_enabled: false }, "s1"), false);
  assert.equal(sesiuneNeconfirmata({ mfa_email_enabled: null }, null), false);
});

test("profil necunoscut inseamna BLOCAT, nu liber", () => {
  assert.equal(sesiuneNeconfirmata(null, "s1"), true);
  assert.equal(sesiuneNeconfirmata(undefined, "s1"), true);
});

test("MFA pornit fara nicio confirmare inseamna BLOCAT", () => {
  assert.equal(sesiuneNeconfirmata({ mfa_email_enabled: true, mfa_sesiuni_confirmate: [] }, "s1"), true);
});

test("REGRESIA CENTRALA: trecerea timpului nu deblocheaza nimic", () => {
  // Semantica veche raspundea „exista o provocare neexpirata?", deci dupa 10
  // minute raspunsul devenea „nu" si sesiunea intra. Aici, o confirmare veche
  // pentru ALTA sesiune ramane fara efect oricat de mult timp trece.
  const profil = {
    mfa_email_enabled: true,
    mfa_sesiuni_confirmate: [{ s: "alta-sesiune", t: Date.now() - 60_000 }],
  };
  assert.equal(sesiuneNeconfirmata(profil, "sesiunea-atacatorului"), true);
});

test("sesiunea confirmata trece, si numai ea", () => {
  const profil = {
    mfa_email_enabled: true,
    mfa_sesiuni_confirmate: [{ s: "s1", t: Date.now() }],
  };
  assert.equal(sesiuneNeconfirmata(profil, "s1"), false);
  assert.equal(sesiuneNeconfirmata(profil, "s2"), true);
  assert.equal(sesiuneNeconfirmata(profil, null), true, "sesiune neidentificabila = blocat");
});

test("confirmarile mai vechi de 30 de zile nu mai conteaza", () => {
  const profil = {
    mfa_email_enabled: true,
    mfa_sesiuni_confirmate: [{ s: "s1", t: Date.now() - VIATA_CONFIRMARE_MS - 1000 }],
  };
  assert.equal(sesiuneNeconfirmata(profil, "s1"), true);
});

test("listaSesiuni nu crede nimic pe cuvant", () => {
  assert.deepEqual(listaSesiuni(null), []);
  assert.deepEqual(listaSesiuni("[]"), [], "un sir nu e o lista");
  const acum = Date.now();
  const curatata = listaSesiuni([{ s: 1, t: 2 }, { s: "fara-t" }, null, "text", { s: "bun", t: acum }]);
  assert.deepEqual(curatata, [{ s: "bun", t: acum }]);
});

test("mai multe dispozitive raman confirmate deodata", () => {
  let lista: unknown = [];
  lista = adaugaSesiune(lista, "laptop");
  lista = adaugaSesiune(lista, "telefon");
  const profil = { mfa_email_enabled: true, mfa_sesiuni_confirmate: lista };
  assert.equal(sesiuneNeconfirmata(profil, "laptop"), false, "telefonul nu scoate laptopul din priza");
  assert.equal(sesiuneNeconfirmata(profil, "telefon"), false);
});

test("lista nu creste la nesfarsit si nu are duplicate", () => {
  let lista: unknown = [];
  for (let i = 0; i < MAX_SESIUNI_CONFIRMATE + 5; i++) lista = adaugaSesiune(lista, `s${i}`);
  const finala = listaSesiuni(lista);
  assert.equal(finala.length, MAX_SESIUNI_CONFIRMATE);
  assert.ok(finala.some((x) => x.s === `s${MAX_SESIUNI_CONFIRMATE + 4}`), "cea mai noua ramane");
  assert.ok(!finala.some((x) => x.s === "s0"), "cea mai veche cade");

  const cuDuplicat = adaugaSesiune(adaugaSesiune([], "s1"), "s1");
  assert.equal(cuDuplicat.length, 1);
});

test("sigiliul se desface doar de cine are cheia", () => {
  const date = { u: "user-1", r: "refresh", e: Date.now() + 60_000 };
  const sigiliu = sigileazaSesiune(date);
  assert.notEqual(sigiliu, "");
  assert.ok(!sigiliu.includes("refresh"), "tokenurile nu apar in clar in cookie");
  assert.deepEqual(desigileazaSesiune(sigiliu), date);
});

test("sigiliul incape intr-un cookie, oricat de mare ar fi JWT-ul", () => {
  // Regresia pe care o apara: prima varianta pastra si access token-ul, iar un
  // JWT gras impingea sigiliul peste 4096 de octeti. Browserul il arunca in
  // tacere, iar omul ramanea cu codul corect si nicio cale de a-l folosi.
  const sigiliu = sigileazaSesiune({ u: "user-1", r: "r".repeat(120), e: Date.now() + 60_000 });
  assert.ok(sigiliu.length < 1000, `sigiliul are ${sigiliu.length} octeti`);
});

test("sigiliul modificat e refuzat, nu acceptat partial", () => {
  const sigiliu = sigileazaSesiune({ u: "user-1", r: "r", e: Date.now() + 60_000 });
  const [iv, tag, continut] = sigiliu.split(".");
  const stricat = continut.slice(0, -2) + (continut.endsWith("AA") ? "BB" : "AA");
  assert.equal(desigileazaSesiune(`${iv}.${tag}.${stricat}`), null);
  assert.equal(desigileazaSesiune("altceva"), null);
  assert.equal(desigileazaSesiune(undefined), null);
});

test("sigiliul expirat nu mai deschide nimic", () => {
  const sigiliu = sigileazaSesiune({ u: "user-1", r: "r", e: Date.now() - 1 });
  assert.equal(desigileazaSesiune(sigiliu), null);
});
