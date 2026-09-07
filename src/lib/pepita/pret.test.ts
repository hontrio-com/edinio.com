import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicaStrategia, citesteStrategia, cotaTva, preturilePentruFeed, pretBrut, rotunjeste2 } from "./pret";

const CU_TVA = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };
const FARA_TVA_IN_PRET = { vat_enabled: true, vat_rate: 21, prices_include_vat: false };
const NEPLATITOR = { vat_enabled: false, vat_rate: 0, prices_include_vat: true };

const IDENTIC = { fel: "identic" as const, valoare: 0 };

test("strategia „identic” lasa pretul cum e", () => {
  assert.equal(aplicaStrategia(99.9, IDENTIC), 99.9);
});

test("adaosul procentual si cel fix", () => {
  assert.equal(aplicaStrategia(100, { fel: "procent", valoare: 10 }), 110);
  assert.equal(aplicaStrategia(100, { fel: "fix", valoare: 15 }), 115);
  assert.equal(aplicaStrategia(19.99, { fel: "procent", valoare: 10 }), 21.99);
});

test("⚠ pretul nu coboara sub zero, oricat de mare ar fi scaderea", () => {
  /* Un pret negativ ar fi respins de ei fara sa spuna de ce; oprit in zero, il prinde
     validatorul nostru si comerciantul vede motivul langa produs. */
  assert.equal(aplicaStrategia(3, { fel: "fix", valoare: -5 }), 0);
  assert.equal(aplicaStrategia(10, { fel: "procent", valoare: -200 }), 0);
});

test("⚠ socoteala nu poarta zgomotul virgulei mobile", () => {
  /* `100 * 1.1` da 110.00000000000001 in JavaScript. */
  assert.equal(aplicaStrategia(100, { fel: "procent", valoare: 10 }), 110);
  assert.equal(rotunjeste2(0.1 + 0.2), 0.3);
  assert.equal(rotunjeste2(1.005), 1.01);
});

test("cota de TVA vine din setarea magazinului, nu dintr-un numar scris in cod", () => {
  assert.equal(cotaTva(CU_TVA), 21);
  assert.equal(cotaTva({ ...CU_TVA, vat_rate: 19 }), 19);
  /* ⚠ Neplatitorul trimite 0, nu cota tarii: campul e obligatoriu la ei si 0 e adevarul. */
  assert.equal(cotaTva(NEPLATITOR), 0);
});

test("⚠ pretul pleaca BRUT, si se completeaza cand magazinul tine preturi fara TVA", () => {
  /* Subsolul lor: „A feltüntetett árak bruttó árak". Un magazin cu preturi nete care ar
     trimite netul ar vinde pe Pepita cu 21% mai ieftin decat crede. */
  assert.equal(pretBrut(100, CU_TVA), 100);
  assert.equal(pretBrut(100, FARA_TVA_IN_PRET), 121);
  assert.equal(pretBrut(100, NEPLATITOR), 100);
});

test("fara reducere se trimite un singur pret", () => {
  const r = preturilePentruFeed(150, null, IDENTIC, CU_TVA);
  assert.deepEqual(r, { pret: 150, pretRedus: null, tva: 21 });
});

test("⚠ pretul taiat devine `Price`, iar cel de vanzare `DiscountedPrice`", () => {
  /*
   * In Edinio `price` e ce plateste clientul si `compare_at_price` e pretul taiat. La ei
   * `Price` e pretul normal. Scrise invers, produsul ar aparea fara nicio reducere.
   */
  const r = preturilePentruFeed(120, 150, IDENTIC, CU_TVA);
  assert.equal(r.pret, 150);
  assert.equal(r.pretRedus, 120);
});

test("⚠ un pret taiat mai MIC decat cel de vanzare nu produce o reducere in sus", () => {
  const r = preturilePentruFeed(150, 120, IDENTIC, CU_TVA);
  assert.equal(r.pret, 150);
  assert.equal(r.pretRedus, null, "nu se trimite `DiscountedPrice` mai mare decat `Price`");
});

test("⚠ pretul redus egal cu cel normal nu se trimite", () => {
  const r = preturilePentruFeed(150, 150, IDENTIC, CU_TVA);
  assert.equal(r.pretRedus, null);
});

test("adaosul se aplica pe AMANDOUA preturile, ca reducerea sa ramana proportionala", () => {
  const r = preturilePentruFeed(100, 200, { fel: "procent", valoare: 10 }, CU_TVA);
  assert.equal(r.pret, 220);
  assert.equal(r.pretRedus, 110);
});

test("pretul zero ramane zero, ca sa-l poata refuza validatorul", () => {
  /* Documentatia lor: „0-s árat rendszerünk nem fogad el". Produsul trebuie oprit la noi,
     cu motiv, nu respins la ei fara explicatie. */
  assert.equal(preturilePentruFeed(0, null, IDENTIC, CU_TVA).pret, 0);
  assert.equal(preturilePentruFeed(-5, null, IDENTIC, CU_TVA).pret, 0);
});

test("strategia salvata stramb nu darama socoteala", () => {
  assert.deepEqual(citesteStrategia(null), { fel: "identic", valoare: 0 });
  assert.deepEqual(citesteStrategia({ fel: "aiurea", valoare: "x" }), { fel: "identic", valoare: 0 });
  assert.deepEqual(citesteStrategia({ fel: "procent", valoare: "10" }), { fel: "procent", valoare: 10 });
});
