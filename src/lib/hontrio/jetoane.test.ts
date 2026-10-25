import test from "node:test";
import assert from "node:assert/strict";
import {
  amprenta, codNou, formaCoduluiValida, formaJetonuluiValida, formaProvocariiValida,
  formaVerificatoruluiValida, jetonNou, provocareS256, verificaPkce,
} from "./jetoane";

/* Exemplul din RFC 7636, Anexa B: verificatorul si provocarea lui S256, scrise de mana in standard. */
const VERIFICATOR_RFC = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const PROVOCARE_RFC = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

test("jetonul e lung, imprevizibil, cu prefixul lui, si trece de propria poarta de forma", () => {
  const a = jetonNou();
  const b = jetonNou();
  assert.notEqual(a, b);
  assert.match(a, /^hnt_[A-Za-z0-9_-]{43}$/, "32 de octeti in base64url, dupa `hnt_`");
  assert.ok(formaJetonuluiValida(a));
});

test("codul e lung, imprevizibil si sigur intr-o adresa", () => {
  const c = codNou();
  assert.notEqual(c, codNou());
  assert.equal(c.length, 43);
  assert.equal(encodeURIComponent(c), c, "nu are ce sa se strice cand pleaca in adresa de intoarcere");
  assert.ok(formaCoduluiValida(c));
});

test("⚠ amprenta nu se poate intoarce la valoare, si e stabila", () => {
  const j = jetonNou();
  assert.equal(amprenta(j), amprenta(j));
  assert.match(amprenta(j), /^[0-9a-f]{64}$/);
  assert.ok(!amprenta(j).includes(j.slice(4, 12)), "nimic din jeton nu se vede in amprenta");
  assert.notEqual(amprenta(j), amprenta(jetonNou()));
});

test("⚠ formele gresite se opresc INAINTE de baza", () => {
  for (const rau of ["", "hnt_", "hnt_scurt", `hnt_${"a".repeat(44)}`, `HNT_${"a".repeat(43)}`, `${"a".repeat(43)}`, null, undefined]) {
    assert.equal(formaJetonuluiValida(rau as string), false, `jeton: ${String(rau)}`);
  }
  /* Un jeton nu e un cod, si invers: altfel un jeton scapat ar fi putut fi incercat ca un cod. */
  assert.equal(formaCoduluiValida(jetonNou()), false);
  assert.equal(formaJetonuluiValida(codNou()), false);
});

test("PKCE: provocarea S256 e chiar cea din RFC 7636", () => {
  assert.equal(provocareS256(VERIFICATOR_RFC), PROVOCARE_RFC);
  assert.ok(verificaPkce(VERIFICATOR_RFC, PROVOCARE_RFC));
});

test("⚠ PKCE: alt verificator, sau unul cu forma gresita, nu deschide nimic", () => {
  const alt = `${VERIFICATOR_RFC.slice(0, -1)}J`;
  assert.equal(verificaPkce(alt, PROVOCARE_RFC), false);
  /* Verificatorul trimis drept provocare: exact ce ar face cineva care l-a vazut trecand prin browser. */
  assert.equal(verificaPkce(PROVOCARE_RFC, PROVOCARE_RFC), false);
  assert.equal(verificaPkce("scurt", PROVOCARE_RFC), false);
  assert.equal(verificaPkce(VERIFICATOR_RFC, "nu-e-o-provocare"), false);
  assert.equal(verificaPkce(null, PROVOCARE_RFC), false);
  assert.equal(verificaPkce(VERIFICATOR_RFC, null), false);
});

test("forma verificatorului si a provocarii, dupa RFC 7636", () => {
  assert.ok(formaVerificatoruluiValida("a".repeat(43)));
  assert.ok(formaVerificatoruluiValida("A-._~".repeat(25) + "abc"));
  assert.equal(formaVerificatoruluiValida("a".repeat(42)), false, "sub 43 de caractere");
  assert.equal(formaVerificatoruluiValida("a".repeat(129)), false, "peste 128 de caractere");
  assert.equal(formaVerificatoruluiValida(`${"a".repeat(43)}+`), false, "`+` nu e in setul permis");
  assert.ok(formaProvocariiValida(PROVOCARE_RFC));
  assert.equal(formaProvocariiValida(`${PROVOCARE_RFC}=`), false, "fara completare");
});
