import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adresaApiTbi, bannerTbiPePaginaProdusului, citesteConfigTbi, FORME_BANNER_TBI, intervalulProduselor, limiteleTbi,
  refuzulSumeiTbi, sumaInLimite, TBI_BANNER_IMPLICIT, tbiGata, tbiPePaginaProdusului,
} from "./config";

const PLIN = { enabled: true, reseller_code: "magazin_ro", reseller_key: "cheie", cheie_criptare: "secret" };

test("gata = pornit + cod + cheie de reseller + cheie de criptare", () => {
  assert.equal(tbiGata(PLIN), true);
  for (const lipsa of ["enabled", "reseller_code", "reseller_key", "cheie_criptare"] as const) {
    assert.equal(tbiGata({ ...PLIN, [lipsa]: lipsa === "enabled" ? false : "" }), false, lipsa);
  }
  assert.equal(tbiGata({ ...PLIN, cheie_criptare: "   " }), false, "spatiile nu sunt o cheie");
  assert.equal(tbiGata(null), false);
});

test("⚠ o configurare a API-ului VECHI (store_id, parola, chei RSA) nu trece drept gata", () => {
  assert.equal(tbiGata({ enabled: true, store_id: "magazin_ro", username: "u", password: "p", cheie_publica_tbi: "x", cheie_privata: "y" }), false);
});

test("pe clientul comerciantului secretele vin mascate (`enc.v1.…`, sir NEGOL): raspunsul ramane corect", () => {
  assert.equal(tbiGata({ ...PLIN, reseller_key: "enc.v1.abc", cheie_criptare: "enc.v1.def" }), true);
});

test("configurarea citita din baza ia implicitele si nu lasa limitele pe dos", () => {
  const c = citesteConfigTbi({});
  assert.equal(c.sandbox, true);
  assert.equal(c.suma_minima, 100);
  assert.equal(c.suma_maxima, 65000);
  assert.equal(c.categorie, "1");
  assert.equal(c.banner_produs, TBI_BANNER_IMPLICIT);
  const pe_dos = citesteConfigTbi({ suma_minima: 5000, suma_maxima: 200 });
  assert.deepEqual([pe_dos.suma_minima, pe_dos.suma_maxima], [200, 5000]);
  assert.equal(citesteConfigTbi({ suma_minima: "" }).suma_minima, 100, "⚠ lipsa nu e zero");
  assert.equal(citesteConfigTbi({ categorie: "abc" }).categorie, "1");
  assert.equal(citesteConfigTbi({ reseller_code: "  cod_ro  " }).reseller_code, "cod_ro");
});

test("limitele se compara in bani, cu capetele incluse", () => {
  const l = { min: 300, max: 30000 };
  assert.equal(sumaInLimite(l, 300), true);
  assert.equal(sumaInLimite(l, 299.99), false);
  assert.equal(sumaInLimite(l, 299.995), true, "299,995 se rotunjeste la 300,00, ca in baza");
  assert.equal(sumaInLimite(l, 30000), true);
  assert.equal(sumaInLimite(l, 30000.01), false);
  assert.equal(sumaInLimite(l, 0), false);
  assert.equal(sumaInLimite(l, Number.NaN), false);
});

test("vitrina primeste DOAR doua numere, si numai cand tbi e gata", () => {
  assert.deepEqual(limiteleTbi({ ...PLIN, suma_minima: 100, suma_maxima: 2000 }), { min: 100, max: 2000 });
  assert.equal(limiteleTbi({ ...PLIN, enabled: false }), null);
});

test("⚠ forma de pe pagina produsului: randul implicit, patru alegeri, si NICIUNA nu atinge comanda", () => {
  assert.deepEqual([...FORME_BANNER_TBI], ["rand", "banner", "video", "ascuns"]);
  assert.equal(bannerTbiPePaginaProdusului({ ...PLIN, banner_produs: "ascuns" }), null);
  assert.equal(bannerTbiPePaginaProdusului({ ...PLIN, banner_produs: "video" })?.forma, "video");
  /* „Ascuns” scoate reclama, nu metoda de plata. */
  assert.notEqual(limiteleTbi({ ...PLIN, banner_produs: "ascuns" }), null);
});

test("⚠⚠ mesajul de pe pagina produsului apare pe ORICE produs; in afara limitelor spune intre ce sume", () => {
  const b = { min: 300, max: 30000, forma: "video" as const };
  assert.deepEqual(tbiPePaginaProdusului(b, 417.9), { forma: "video", nota: null });
  /* VetDepo, 16.11.2026: pretul median 83,90 lei, iar cu limitele 300 - 30.000 mesajul lipsea de pe 1.629 de produse. */
  const ieftin = tbiPePaginaProdusului(b, 83.9);
  assert.ok(ieftin, "un produs sub minim a ramas fara mesaj");
  assert.equal(ieftin.forma, "video");
  assert.equal(ieftin.nota, "Pentru comenzi intre 300 lei si 30.000 lei.");
  assert.doesNotMatch(ieftin.nota ?? "", /[ăâîșțĂÂÎȘȚ]/, "diacritice in vitrina");
  assert.ok(tbiPePaginaProdusului(b, 45000)?.nota, "peste maxim trebuie spus si el");
  assert.equal(tbiPePaginaProdusului(null, 100), null, "„Nimic” ales sau tbi neconfigurat: nimic");
});

test("⚠ refuzul de la plasare: numai pentru tbi, cu mesaj de vitrina (fara diacritice)", () => {
  assert.equal(refuzulSumeiTbi("cash_on_delivery", null, 5), null);
  const neconfigurat = refuzulSumeiTbi("tbi", null, 500)!;
  const sub = refuzulSumeiTbi("tbi", { ...PLIN, suma_minima: 300 }, 100)!;
  for (const m of [neconfigurat, sub]) assert.doesNotMatch(m, /[ăâîșțĂÂÎȘȚ]/);
  assert.match(sub, /300 lei/);
  assert.equal(refuzulSumeiTbi("tbi", PLIN, 500), null);
});

test("adresele Fusion Pay: testul pe `ro.tbi-uat.online`, realul pe `ro.tbibank.support`", () => {
  assert.equal(adresaApiTbi(true), "https://ro.tbi-uat.online/api");
  assert.equal(adresaApiTbi(false), "https://ro.tbibank.support/api");
});

test("intervalul produselor de finantare: cea mai mica suma minima, cea mai mare maxima", () => {
  const p = (sumaMin: number, sumaMax: number) => ({ id: 1, nume: "", luni: 6, dobanda: 0, comision: 0, sumaMin, sumaMax });
  assert.deepEqual(intervalulProduselor([p(1000.01, 4000), p(100, 2000), p(4000.01, 10000)]), { min: 100, max: 10000 });
  assert.equal(intervalulProduselor([]), null);
  assert.equal(intervalulProduselor([p(500, 0)]), null);
});
