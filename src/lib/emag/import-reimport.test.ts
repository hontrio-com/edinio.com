import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { construiesteIndex, potriveste, raportImport, type OfertaCunoscuta, type OfertaVenita } from "./import";

/*
 * Oferta STIUTA ramasa fara produs se leaga la loc de produsul reimportat (14.11.2026).
 *
 * VetDepo si-a sters catalogul si l-a reimportat (12-14.11). Cheia straina `SET NULL` a lasat mii de
 * oferte vii fara produs, cu stocul si pretul inghetate la eMAG. Importul („Leagă produsele cu ofertele
 * tale de pe eMAG”, butonul spre care trimiteau chiar mesajele noastre) le lua drept „cunoscute” si nu
 * le mai cauta niciodata dupa cheie, deci nu repara nimic.
 */

const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";
const EAN = "5941234567890";

const oferta = (x: Partial<OfertaVenita> & { emag_id: number }): OfertaVenita =>
  ({ part_number_key: null, part_number: null, ean: [], ...x });
const orfana = (emag_id: number, extra: Partial<OfertaCunoscuta> = {}): OfertaCunoscuta =>
  ({ emag_id, product_id: null, variant_title: null, part_number_key: null, ...extra });

test("⚠⚠ oferta stiuta FARA produs se leaga de produsul reimportat, dupa EAN", () => {
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: "VET-1", ean: EAN }]);
  const r = potriveste([oferta({ emag_id: 7, ean: [EAN] })], index, [orfana(7)]).potriviri;
  assert.deepEqual(r.get(7), { fel: "relegata", product_id: P1, variant_title: null, prin: "ean" });
});

test("⚠⚠ ... si dupa SKU (`part_number`-ul lor), cand EAN-ul lipseste", () => {
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: "AVX-AG602H", ean: null }]);
  const r = potriveste([oferta({ emag_id: 7, part_number: "AVX-AG602H" })], index, [orfana(7)]).potriviri;
  assert.deepEqual(r.get(7), { fel: "relegata", product_id: P1, variant_title: null, prin: "sku" });
});

test("propriul `part_number_key` al ofertei orfane nu o opreste: duce la ea insasi, fara produs", () => {
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: null, ean: EAN }]);
  const r = potriveste(
    [oferta({ emag_id: 7, part_number_key: "D5DD9BBBM", ean: [EAN] })], index,
    [orfana(7, { part_number_key: "D5DD9BBBM" })],
  ).potriviri;
  assert.equal(r.get(7)?.fel, "relegata");
});

test("⚠ produsul ocupat de o oferta VIE nu se ia: oferta orfana ramane cunoscuta, fara produs", () => {
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: null, ean: EAN }]);
  const r = potriveste(
    [oferta({ emag_id: 7, ean: [EAN] }), oferta({ emag_id: 8, ean: [EAN] })], index,
    [orfana(7), { emag_id: 8, product_id: P1, variant_title: null, part_number_key: null }],
  ).potriviri;
  assert.deepEqual(r.get(7), { fel: "cunoscuta", product_id: null, variant_title: null });
  assert.equal(r.get(8)?.fel, "cunoscuta");
});

test("⚠ doua oferte orfane pe acelasi produs: prima (dupa `emag_id`) se leaga, a doua ramane cum era", () => {
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: null, ean: EAN }]);
  const r = potriveste([oferta({ emag_id: 9, ean: [EAN] }), oferta({ emag_id: 7, ean: [EAN] })], index, [orfana(7), orfana(9)]).potriviri;
  assert.equal(r.get(7)?.fel, "relegata");
  assert.deepEqual(r.get(9), { fel: "cunoscuta", product_id: null, variant_title: null });
});

test("⚠ cheie ambigua (doua produse) = nu se leaga nimic", () => {
  const index = construiesteIndex([
    { product_id: P1, variant_title: null, sku: null, ean: EAN },
    { product_id: P2, variant_title: null, sku: null, ean: EAN },
  ]);
  const r = potriveste([oferta({ emag_id: 7, ean: [EAN] })], index, [orfana(7)]).potriviri;
  assert.deepEqual(r.get(7), { fel: "cunoscuta", product_id: null, variant_title: null });
});

test("oferta stiuta CU produs ramane pe ce s-a scris data trecuta, oricare i-ar fi cheile", () => {
  const index = construiesteIndex([{ product_id: P2, variant_title: null, sku: null, ean: EAN }]);
  const r = potriveste([oferta({ emag_id: 7, ean: [EAN] })], index, [orfana(7, { product_id: P1 })]).potriviri;
  assert.deepEqual(r.get(7), { fel: "cunoscuta", product_id: P1, variant_title: null });
});

test("raportul numara oferta relegata la „legate”, nu la „ocupate”", () => {
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: null, ean: EAN }]);
  const r = potriveste([oferta({ emag_id: 7, ean: [EAN] })], index, [orfana(7)]).potriviri;
  assert.deepEqual(raportImport(r), { citite: 1, cunoscute: 0, legate: 1, noi: 0, nehotarate: 0, ocupate: 0 });
});

test("⚠⚠ scrierea: relegata in lotul ei, FARA `auto_sync`; substitutul disparut desprins intai; stoc si pret la coada", () => {
  const s = readFileSync("src/lib/emag/import-run.ts", "utf8").replace(/\r\n/g, "\n");
  const i = s.indexOf("async function scrieOferte(");
  const f = s.slice(i, s.indexOf("\n}\n", i));
  /* ⚠ INAINTEA ramurii care scrie `auto_sync: false`: altfel o oferta care se sincroniza s-ar opri. */
  const relegata = f.indexOf('if (p.fel === "relegata") {');
  const noi = f.indexOf("noi.push({ ...comun, ...legatura, auto_sync: false, creat_de_edinio: false });");
  assert.ok(relegata > 0 && noi > relegata, "ramura relegatei sta inaintea celei care stinge `auto_sync`");
  assert.match(f, /relegate\.push\(\{ \.\.\.comun, product_id: p\.product_id, variant_title: p\.variant_title \}\);\s*continue;/);
  assert.match(f, /if \(relegate\.length > 0\) await scrieRelegate\(admin, businessId, oferte, relegate\);/);

  const j = s.indexOf("async function scrieRelegate(");
  const g = s.slice(j, s.indexOf("\n}\n", j));
  /* Desprinde numai ce NU mai vine de la eMAG; un detinator viu opreste relegarea acelei oferte. */
  assert.match(g, /const vii = new Set\(oferte\.map\(\(o\) => o\.id\)\);/);
  assert.match(g, /if \(altii\.some\(\(t\) => vii\.has\(t\.emag_id\)\)\) continue;/);
  const desprindere = g.indexOf('.update({ product_id: null, error: MESAJ_DESPRINSA } as never)');
  const scriere = g.indexOf('for (const lot of bucati(deScris, LOT_SCRIERE)) {');
  assert.ok(desprindere > 0 && scriere > desprindere, "intai se elibereaza locul, apoi se scrie legatura (unicul pe produs)");
  assert.doesNotMatch(g, /auto_sync/, "relegarea nu atinge `auto_sync`");
  assert.match(g, /await enqueueEmagStocMany\(businessId, legate\);\s*await enqueueEmagPretMany\(businessId, legate\);/);
});
