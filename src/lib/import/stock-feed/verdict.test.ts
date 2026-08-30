import assert from "node:assert/strict";
import { test } from "node:test";
import { rezumatCifre, verdictRulare, type CifreRulare } from "./verdict";

/*
 * Verdictul e singurul lucru pe care comerciantul chiar il citeste dupa o rulare.
 * Daca minte, ori se sperie degeaba, ori sta linistit cand nu trebuie.
 *
 * Prima proba de aici e chiar rularea reala care a dat de gol regula veche.
 */

const cifre = (over: Partial<CifreRulare> = {}): CifreRulare => ({
  total: 0,
  written: 0,
  unchanged: 0,
  pending: 0,
  not_found: 0,
  ambiguous: 0,
  invalid: 0,
  duplicate: 0,
  ignored: 0,
  ...over,
});

test("feed de distribuitor, totul deja la zi: NU e alarma", () => {
  /*
   * Cifrele adevarate ale rularii din 18.08.2026 pe feedul Maravet, magazinul
   * cu 1.275 de produse. Regula veche compara `unchanged` cu `total` si dadea
   * „A citit fisierul, dar n-a actualizat nimic" — desi toate cele 1.275 de
   * produse ale magazinului se potrivisera si erau deja la zi.
   */
  const v = verdictRulare(cifre({ total: 5926, written: 0, unchanged: 1275, not_found: 4651 }), "ok");

  assert.equal(v.fel, "deja_la_zi");
  assert.equal(v.ton, "bun", "o rulare sanatoasa n-are voie sa fie portocalie");
  assert.match(v.text, /deja la zi/);
  assert.equal(v.potrivite, 1275);
  assert.equal(v.negasiteSuntNormale, true, "un feed mai mare decat magazinul e normal");
});

test("niciun cod nu s-a potrivit: ASTA e alarma adevarata", () => {
  /* Coloana gresita sau cheia gresita: fisierul se citeste, dar nu ajunge nicaieri. */
  const v = verdictRulare(cifre({ total: 5926, written: 0, unchanged: 0, not_found: 5926 }), "ok");

  assert.equal(v.fel, "nimic_potrivit");
  assert.equal(v.ton, "atentie");
  assert.match(v.text, /niciun cod/);
  assert.equal(v.negasiteSuntNormale, false, "cand nimic nu s-a potrivit, negasitele NU sunt normale");
});

test("o rulare care chiar a scris e reusita", () => {
  const v = verdictRulare(cifre({ total: 5926, written: 812, unchanged: 463, not_found: 4651 }), "ok");
  assert.equal(v.fel, "reusit");
  assert.equal(v.ton, "bun");
  assert.equal(v.potrivite, 1275);
});

test("esecul bate orice cifra", () => {
  const v = verdictRulare(cifre({ total: 5926, written: 900, unchanged: 300 }), "error");
  assert.equal(v.fel, "esuat");
  assert.equal(v.ton, "rau");
});

test("randurile ramase se spun, cu numarul lor", () => {
  const v = verdictRulare(cifre({ total: 5926, written: 300, unchanged: 100, pending: 875 }), "ok");
  assert.equal(v.fel, "in_curs");
  assert.equal(v.ton, "atentie");
  assert.match(v.text, /875/);
});

test("cand mai e ceva in afara de negasite, nu se mai spune ca e normal", () => {
  const v = verdictRulare(
    cifre({ total: 5926, written: 10, unchanged: 1265, not_found: 4600, ambiguous: 51 }),
    "ok",
  );
  assert.equal(v.negasiteSuntNormale, false, "ambiguitatile chiar cer atentie");
  assert.equal(v.probleme, 4651);
});

test("totaluri scrise inaintea campului `ignored` nu dau NaN", () => {
  /* Randurile vechi din baza n-au cheia. Fara `?? 0`, suma iesea NaN si tot
     randul de probleme disparea de pe ecran, tacut. */
  const vechi = { total: 100, written: 5, unchanged: 90, not_found: 5 } as CifreRulare;
  const v = verdictRulare(vechi, "ok");
  assert.equal(Number.isNaN(v.probleme), false);
  assert.equal(v.probleme, 5);
  assert.equal(v.potrivite, 95);
});

test("fara cifre deloc, verdictul nu pica pe nas", () => {
  const v = verdictRulare(null, "ok");
  assert.equal(v.fel, "reusit");
  assert.equal(v.potrivite, 0);
  assert.equal(rezumatCifre(null), null);
});

test("rezumatul numara de la ce s-a potrivit, nu de la cate randuri are fisierul", () => {
  /* „0 actualizate din 5926 randuri" il facea pe om sa creada ca ar fi trebuit
     actualizate 5926 de produse, cand magazinul are 1275. */
  const r = rezumatCifre(cifre({ total: 5926, written: 0, unchanged: 1275, not_found: 4651 }));
  assert.equal(r, "1275 produse potrivite · 1275 deja la zi");
  assert.ok(!r?.includes("5926"), "numarul de randuri din fisier nu e o promisiune");
});

test("rezumatul arata si actualizarile, cand exista", () => {
  const r = rezumatCifre(cifre({ total: 5926, written: 812, unchanged: 463 }));
  assert.equal(r, "1275 produse potrivite · 812 actualizate · 463 deja la zi");
});
