import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asteptareaCerutaDeEi } from "@/lib/marketplace/ritm-impartit";
import { cheiaVanzatorului, grupulCaii, LIMITE_TRENDYOL } from "./ritm";

/* ══════════════════════════════════════════════════════════════════════════
   RITMUL CATRE TRENDYOL, NUMARAT INTR-UN SINGUR LOC (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Pana azi clientul Trendyol n-avea NICIO franare: singura era `PACE_MS = 350` in bucla
   cronului, in memoria unei instante. Deci cronul, un buton apasat de om, importul si un
   webhook sosit intre timp credeau fiecare ca au bugetul intreg — iar Trendyol vedea suma.

   ⚠ SI SE SCHIMBA CHIAR ACUM: din 14 septembrie 2026 serviciile lor de produs trec pe limite
   pe GRUP (citire de produs, scriere de produs, pret/stoc), per vanzator, nu pe fiecare cale.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ cheia e a VANZATORULUI si a grupului, nu a magazinului", () => {
  /*
   * Doua magazine Edinio legate la acelasi `supplierId` impart acelasi buget la ei. Numarate
   * separat, ar fi trecut de el impreuna fara sa vada nimeni — masurat: VetDepo si Okxi chiar
   * au acelasi `supplier_id` in productie.
   */
  const a = cheiaVanzatorului(1182665, "RO", "product-write");
  const b = cheiaVanzatorului("1182665", "RO", "product-write");
  assert.equal(a, b, "acelasi vanzator, aceeasi cheie, si cand id-ul vine ca sir");

  /* ⚠ Vitrine diferite = bugete diferite la ei. */
  assert.notEqual(a, cheiaVanzatorului(1182665, "GR", "product-write"));
  /* ⚠ Si grupuri diferite: o trecere grea de catalog n-are voie sa intarzie comenzile. */
  assert.notEqual(a, cheiaVanzatorului(1182665, "RO", "orders"));
});

test("⚠ id-ul comerciantului nu se scrie ca atare in masa de contorizare", () => {
  const cheie = cheiaVanzatorului(1182665, "RO", "orders");
  assert.doesNotMatch(cheie, /1182665/, "se amprenteaza");
  assert.match(cheie, /^[0-9a-f]{24}:orders$/, "dar grupul ramane citibil, ca sa se poata depana");
});

test("⚠ grupul se citeste din CALE, si `price-and-inventory` are grupul lui", () => {
  /*
   * ⚠ Ordinea conteaza: `price-and-inventory` e tot sub `/product/`, deci trebuie intrebat
   * INAINTEA regulii generale de produs. Altfel miscarile de stoc de dupa vanzari ar fi
   * impartit galeata cu incarcarile grele de catalog.
   */
  assert.equal(grupulCaii("/integration/product/sellers/1/products/price-and-inventory", "POST"), "inventory");
  assert.equal(grupulCaii("/integration/product/sellers/1/v2/products", "POST"), "product-write");
  assert.equal(grupulCaii("/integration/product/sellers/1/products?approved=true", "GET"), "product-read");
  assert.equal(grupulCaii("/integration/order/sellers/1/orders", "GET"), "orders");
  assert.equal(grupulCaii("/integration/oms/core/sellers/1/shipment-packages/2", "PUT"), "orders");
  assert.equal(grupulCaii("/integration/sellers/1/addresses", "GET"), "altele");
});

test("⚠ comenzile au fereastra LOR, mult mai lunga", () => {
  /* Cel mai stramt masurat public: „get shipment packages" porneste pe la 30/minut la
     vanzatorii mici. Se tine sub el cu bunastiinta. */
  assert.equal(LIMITE_TRENDYOL.orders.fereastraMs, 60_000);
  assert.ok(LIMITE_TRENDYOL.orders.limita <= 30, "sub pragul lor cunoscut");
  for (const g of ["product-read", "product-write", "inventory"] as const) {
    assert.equal(LIMITE_TRENDYOL[g].fereastraMs, 1000, `${g} se numara pe secunda`);
  }
});

test("⚠ `Retry-After` se citeste SI in secunde, SI ca data", () => {
  /*
   * Amandoua sunt in standard si amandoua apar in salbaticie. Citita gresit, o data ar fi
   * iesit `NaN` si pauza ar fi cazut pe implicit — adica tocmai cand ei ne spun cel mai
   * limpede cat sa asteptam, noi am fi ghicit.
   */
  assert.equal(asteptareaCerutaDeEi(new Headers({ "retry-after": "45" })), 45_000);
  const peste2min = new Date(Date.now() + 120_000).toUTCString();
  const citit = asteptareaCerutaDeEi(new Headers({ "retry-after": peste2min }));
  assert.ok(citit > 110_000 && citit <= 121_000, `data se citeste ca durata (${citit})`);
  /* ⚠ Fara antet, un implicit cinstit — nu zero. */
  assert.equal(asteptareaCerutaDeEi(new Headers()), 30_000);
  assert.equal(asteptareaCerutaDeEi(new Headers({ "retry-after": "aiurea" })), 30_000);
});

test("⚠ clientul cere randul INAINTE de fetch, si spune tuturor la 429", () => {
  const client = viu("src/lib/trendyol/client.ts");
  const iRand = client.indexOf("await asteaptaRandulTrendyol(");
  const iFetch = client.indexOf("await fetch(");
  assert.ok(iRand > 0 && iRand < iFetch, "randul se cere inaintea cererii");
  assert.match(client, /if \(res\.status === 429\) \{\s*void tineCont429\(/);
});

test("⚠ se cade DESCHIS: cand n-a venit randul, cererea pleaca totusi", () => {
  /*
   * Cea mai importanta hotarare, si e usor de inversat din greseala. Un limitator care
   * BLOCHEAZA ar opri confirmarile de comenzi si miscarile de stoc ale tuturor magazinelor —
   * un incident mai mare decat depasirea de care ne aparam. Plasa de dedesubt e chiar 429-ul
   * lor, cu pauza impartita.
   */
  const client = viu("src/lib/trendyol/client.ts");
  const i = client.indexOf("await asteaptaRandulTrendyol(");
  const linie = client.slice(i - 60, i + 120);
  assert.doesNotMatch(linie, /if \(!\s*await asteaptaRandulTrendyol/, "raspunsul NU opreste cererea");
  assert.doesNotMatch(linie, /return \{ error/, "si nu se intoarce cu eroare de aici");
});

test("⚠ pauza nu se scurteaza, si are plafon", () => {
  /*
   * Doua instante care iau 429 in aceeasi secunda, una cu `Retry-After: 60` si alta fara
   * antet, n-au voie sa se calce: cea care stie mai mult trebuie sa castige. Iar un
   * `Retry-After` urias sau stalcit n-are voie sa opreasca un magazin pe ore.
   *
   * ⚠ MASURAT IN PRODUCTIE, in tranzactie intoarsa inapoi: pauza de 4s a ramas 4s dupa ce
   * s-a cerut una de 1s peste ea.
   */
  const mig = readFileSync("migrations/2026-10-28-ritm-cu-pauza.sql", "utf8");
  assert.match(mig, /greatest\(coalesce\(privat\.ritm_extern\.pauza_pana, v_pana\), v_pana\)/);
  assert.match(mig, /least\(greatest\(coalesce\(p_ms, 0\), 1000\), 300000\)/);
  /* ⚠ Si pauza NU consuma jeton: cat timp ei ne-au spus sa tacem, o cerere in plus se
     numara la ei ca cerere respinsa. */
  assert.match(mig, /if v_pauza is not null and v_pauza > now\(\) then/);
});
