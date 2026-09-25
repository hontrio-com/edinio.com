import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERMALINKURI_IMPLICITE, felulSegmentului, hrefBrandSegment, hrefCatalogPropriu, hrefProdus,
  permalinkuriDin, problemaPrefixului, setareaPermalinkurilor, suntImplicite, urmatoareaSetare,
  valideazaPermalinkuri,
} from "./permalinkuri";

test("fara setare, adresele sunt exact cele de azi", () => {
  for (const pc of [null, undefined, {}, { permalinks: null }, { permalinks: "x" }, "nimic"]) {
    assert.deepEqual(permalinkuriDin(pc), { produs: "product", magazin: "magazin", brand: "brand" });
  }
  assert.equal(hrefProdus("/magazinul-meu", "tricou"), "/magazinul-meu/product/tricou");
  assert.equal(hrefProdus("", "tricou"), "/product/tricou");
  assert.equal(hrefCatalogPropriu("/m"), "/m/magazin");
  assert.equal(hrefBrandSegment("https://x.ro", "nike"), "https://x.ro/brand/nike");
  assert.ok(suntImplicite(permalinkuriDin({})));
});

test("o setare buna se aplica, una stricata cade pe implicit, niciodata pe o adresa rupta", () => {
  assert.deepEqual(
    permalinkuriDin({ permalinks: { produs: "Produs", magazin: "produse", brand: "marci" } }),
    { produs: "produs", magazin: "produse", brand: "marci" },
  );
  // forma gresita sau rezervata: doar felul acela cade pe implicit
  assert.equal(permalinkuriDin({ permalinks: { produs: "pro dus" } }).produs, "product");
  assert.equal(permalinkuriDin({ permalinks: { produs: "cos" } }).produs, "product");
  assert.equal(permalinkuriDin({ permalinks: { magazin: "checkout" } }).magazin, "magazin");
  // doua feluri pe acelasi prefix: toate pe implicit
  assert.deepEqual(permalinkuriDin({ permalinks: { produs: "x", magazin: "x" } }), { ...PERMALINKURI_IMPLICITE });
});

test("regulile unui prefix", () => {
  assert.equal(problemaPrefixului("produs", "produs"), null);
  assert.equal(problemaPrefixului("produs", "product"), null);
  assert.equal(problemaPrefixului("magazin", "shop"), null);
  assert.equal(problemaPrefixului("brand", "branduri"), null);
  for (const rau of ["", "-x", "x-", "Produs", "prod_us", "pro/dus", "a".repeat(41), "produs.html"]) {
    assert.ok(problemaPrefixului("produs", rau), rau);
  }
  // rutele fixe ale altui fel sau ale comertului nu pot fi prefix
  for (const rezervat of ["magazin", "brand", "cos", "checkout", "cont", "cautare", "politici", "confirm", "retur", "api"]) {
    assert.ok(problemaPrefixului("produs", rezervat), rezervat);
  }
  assert.ok(problemaPrefixului("magazin", "product"));
  assert.ok(problemaPrefixului("brand", "magazin"));
  assert.doesNotMatch(problemaPrefixului("produs", "Produs") ?? "", /—/);
});

test("validarea pe server: diferite intre ele si nu peste o pagina proprie", () => {
  const bun = valideazaPermalinkuri({ produs: "produs", magazin: "produse", brand: "marci" }, ["contact"]);
  assert.deepEqual(bun, { ok: true, valoare: { produs: "produs", magazin: "produse", brand: "marci" } });
  const dublu = valideazaPermalinkuri({ produs: "x", magazin: "x", brand: "brand" }, []);
  assert.equal(dublu.ok, false);
  const pestePagina = valideazaPermalinkuri({ produs: "produs", magazin: "Contact", brand: "brand" }, ["contact"]);
  assert.equal(pestePagina.ok, false);
  assert.match((pestePagina as { eroare: string }).eroare, /pagină cu linkul „contact”/);
});

test("un prefix vechi al altui fel nu se poate lua: adresele lui ar da 404", () => {
  const anterioare = { produs: ["produse"], magazin: [], brand: [] };
  const r = valideazaPermalinkuri({ produs: "articole", magazin: "produse", brand: "brand" }, [], anterioare);
  assert.equal(r.ok, false);
  assert.match((r as { eroare: string }).eroare, /folosit înainte pentru produselor/);
  // acelasi fel isi poate relua prefixul vechi
  assert.equal(valideazaPermalinkuri({ produs: "produse", magazin: "magazin", brand: "brand" }, [], anterioare).ok, true);
});

test("istoricul: prefixul vechi ramane, implicitul nu se tine, cel nou iese din istoric", () => {
  const s0 = setareaPermalinkurilor({});
  const s1 = urmatoareaSetare(s0, { produs: "produs", magazin: "magazin", brand: "brand" });
  assert.deepEqual(s1.anterioare, { produs: [], magazin: [], brand: [] });
  const s2 = urmatoareaSetare(s1, { produs: "articol", magazin: "magazin", brand: "brand" });
  assert.deepEqual(s2.anterioare.produs, ["produs"]);
  // inapoi la „produs": iese din istoric, „articol" intra
  const s3 = urmatoareaSetare(s2, { produs: "produs", magazin: "magazin", brand: "brand" });
  assert.deepEqual(s3.anterioare.produs, ["articol"]);
  // plafonat
  let s = s3;
  for (let i = 0; i < 20; i++) s = urmatoareaSetare(s, { produs: `p${i}`, magazin: "magazin", brand: "brand" });
  assert.equal(s.anterioare.produs.length, 10);
  // si se citeste inapoi la fel
  assert.deepEqual(setareaPermalinkurilor({ permalinks: s }).anterioare.produs, s.anterioare.produs);
});

test("felul unui segment: curentul se randeaza, implicitul si cele vechi redirectioneaza", () => {
  const s = setareaPermalinkurilor({
    permalinks: { produs: "produs", magazin: "produse", brand: "marci", anterioare: { produs: ["articol"], magazin: [], brand: [] } },
  });
  assert.deepEqual(felulSegmentului("produs", s), { fel: "produs", curent: true });
  assert.deepEqual(felulSegmentului("product", s), { fel: "produs", curent: false });
  assert.deepEqual(felulSegmentului("articol", s), { fel: "produs", curent: false });
  assert.deepEqual(felulSegmentului("magazin", s), { fel: "magazin", curent: false });
  assert.deepEqual(felulSegmentului("marci", s), { fel: "brand", curent: true });
  assert.deepEqual(felulSegmentului("brand", s), { fel: "brand", curent: false });
  assert.equal(felulSegmentului("contact", s), null);
  // exact, ca rutele Next: `/Magazin`, `/Product/x` dau 404 si inainte, si dupa
  assert.equal(felulSegmentului("Produs", s), null);
  assert.equal(felulSegmentului("Product", setareaPermalinkurilor({})), null);
  assert.equal(felulSegmentului("Magazin", setareaPermalinkurilor({})), null);
  // fara setare: implicitul e curent
  assert.deepEqual(felulSegmentului("product", setareaPermalinkurilor({})), { fel: "produs", curent: true });
});
