import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adreseleTbi, bannerTbiPePaginaProdusului, citesteConfigTbi, FORME_BANNER_TBI, limiteleTbi, mesajLimiteTbi, refuzulSumeiTbi,
  sumaInLimite, tbiGata,
  TBI_SUMA_MAXIMA_IMPLICITA, TBI_SUMA_MINIMA_IMPLICITA,
} from "./config";

const GATA = {
  enabled: true, sandbox: false, store_id: "magazin_ro", username: "u", password: "p",
  cheie_publica_tbi: "-----BEGIN PUBLIC KEY-----", cheie_privata: "-----BEGIN PRIVATE KEY-----",
};

test("gata = pornit + cod + utilizator + parola + AMBELE chei", () => {
  assert.equal(tbiGata(GATA), true);
  for (const camp of ["store_id", "username", "password", "cheie_publica_tbi", "cheie_privata"] as const) {
    assert.equal(tbiGata({ ...GATA, [camp]: "" }), false, camp);
  }
  assert.equal(tbiGata({ ...GATA, enabled: false }), false);
  assert.equal(tbiGata(null), false);
  /* Pe clientul comerciantului secretele vin `enc.v1.…`: tot „gata". */
  assert.equal(tbiGata({ ...GATA, password: "enc.v1.abc", cheie_privata: "enc.v1.def" }), true);
});

test("configurarea citita din baza ia implicitele si nu lasa limitele pe dos", () => {
  const c = citesteConfigTbi({});
  assert.equal(c.suma_minima, TBI_SUMA_MINIMA_IMPLICITA);
  assert.equal(c.suma_maxima, TBI_SUMA_MAXIMA_IMPLICITA);
  assert.equal(c.sandbox, true, "implicitul e mediul de TEST, nu creditele reale");
  assert.equal(c.categorie, "1");
  const pe_dos = citesteConfigTbi({ suma_minima: 5000, suma_maxima: 300 });
  assert.deepEqual([pe_dos.suma_minima, pe_dos.suma_maxima], [300, 5000]);
  assert.equal(citesteConfigTbi({ categorie: "abc" }).categorie, "1");
  assert.equal(citesteConfigTbi({ suma_minima: "450,50" }).suma_minima, 450.5);
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
  assert.deepEqual(limiteleTbi({ ...GATA, suma_minima: 500, suma_maxima: 9000 }), { min: 500, max: 9000 });
  assert.equal(limiteleTbi({ ...GATA, enabled: false }), null);
});

test("⚠ forma de pe pagina produsului: randul implicit, patru alegeri, si NICIUNA nu atinge comanda", () => {
  assert.equal(citesteConfigTbi({}).banner_produs, "rand", "lipsa = randul discret");
  assert.equal(citesteConfigTbi({ banner_produs: "video" }).banner_produs, "video");
  assert.equal(citesteConfigTbi({ banner_produs: "uriasa" }).banner_produs, "rand", "o forma necunoscuta cade pe implicit");
  assert.deepEqual([...FORME_BANNER_TBI], ["rand", "banner", "video", "ascuns"]);

  const min = TBI_SUMA_MINIMA_IMPLICITA, max = TBI_SUMA_MAXIMA_IMPLICITA;
  assert.deepEqual(bannerTbiPePaginaProdusului(GATA), { min, max, forma: "rand" });
  assert.deepEqual(bannerTbiPePaginaProdusului({ ...GATA, banner_produs: "banner" }), { min, max, forma: "banner" });
  assert.deepEqual(bannerTbiPePaginaProdusului({ ...GATA, banner_produs: "video" }), { min, max, forma: "video" });
  assert.equal(bannerTbiPePaginaProdusului({ ...GATA, banner_produs: "ascuns" }), null);
  assert.equal(bannerTbiPePaginaProdusului({ ...GATA, enabled: false, banner_produs: "video" }), null, "tbi oprit = nimic pe produs");
  assert.equal(bannerTbiPePaginaProdusului(null), null);

  /* Oricare forma, comanda ramane neatinsa: aceleasi limite in formular si niciun refuz la plasare. */
  for (const forma of FORME_BANNER_TBI) {
    const cfg = { ...GATA, banner_produs: forma };
    assert.deepEqual(limiteleTbi(cfg), { min, max }, forma);
    assert.equal(tbiGata(cfg), true, forma);
    assert.equal(refuzulSumeiTbi("tbi", cfg, 1000), null, forma);
  }
});

test("⚠ refuzul de la plasare: numai pentru tbi, cu mesaj de vitrina (fara diacritice)", () => {
  assert.equal(refuzulSumeiTbi("cash_on_delivery", null, 10), null);
  assert.equal(refuzulSumeiTbi("tbi", GATA, 1000), null);
  const sub = refuzulSumeiTbi("tbi", GATA, 100);
  assert.ok(sub && sub.includes(mesajLimiteTbi({ min: 300, max: 30000 })));
  assert.ok(refuzulSumeiTbi("tbi", { ...GATA, enabled: false }, 1000)?.includes("nu mai este disponibila"));
  for (const m of [sub!, mesajLimiteTbi({ min: 300, max: 30000 })]) {
    assert.ok(!/[ăâîșțĂÂÎȘȚ]/.test(m), `mesaj de vitrina cu diacritice: ${m}`);
  }
});

test("⚠ productia are `/Api` in cale, testul nu (asa scrie in ambele documente ale lor)", () => {
  assert.equal(adreseleTbi(false).finalizare, "https://ecommerce.tbibank.ro/Api/LoanApplication/Finalize");
  assert.equal(adreseleTbi(false).anulare, "https://ecommerce.tbibank.ro/Api/LoanApplication/CanceledByCustomer");
  assert.equal(adreseleTbi(true).finalizare, "https://vmrouatftos01.westeurope.cloudapp.azure.com/LoanApplication/Finalize");
  assert.equal(adreseleTbi(true).anulare, "https://vmrouatftos01.westeurope.cloudapp.azure.com/LoanApplication/CanceledByCustomer");
});
