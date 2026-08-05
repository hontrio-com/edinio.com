import assert from "node:assert/strict";
import { test } from "node:test";
import { slimCatalogProduct } from "./catalog-slim";
import { getProductPriceRange } from "@/lib/utils/product-price";

/**
 * De ce `price_range` e camp OBLIGATORIU si de ce nu se mai deriva in browser.
 *
 * Payload-ul slim pastreaza din `variants` doar `enabled` si `options`, si arunca
 * `combinations` — asta e chiar rostul lui, la 1221 de produse. Deci in browser nu
 * mai exista din ce sa calculezi intervalul, iar rezerva locala pe care o aveau
 * cardul si cautarea raspundea „niciun pret de vanzare" pentru fiecare produs cu
 * variante.
 */

const rand = (combinations: unknown[]) => ({
  price: 156.8,
  description: null,
  images: ["a.jpg", "b.jpg"],
  page_sections: {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["S", "M"] }],
      combinations,
    },
  },
});

test("intervalul se calculeaza INAINTE de a arunca combinatiile", () => {
  const slim = slimCatalogProduct(rand([
    { title: "S", enabled: true, price: 203 },
    { title: "M", enabled: true, price: 231 },
  ]));
  assert.deepEqual(slim.price_range, { min: 203, max: 231, hasRange: true, faraOferta: false });
});

test("combinatiile chiar sunt aruncate din payload", () => {
  const slim = slimCatalogProduct(rand([{ title: "S", enabled: true, price: 438 }]));
  const ps = slim.page_sections as { variants?: { combinations?: unknown; options?: unknown } };
  assert.equal(ps.variants?.combinations, undefined, "asta e economia de payload");
  assert.ok(Array.isArray(ps.variants?.options), "axele raman: din ele se randeaza selectorul");
});

test("recalculat in browser pe payload-ul slim, raspunsul ar fi GRESIT", () => {
  // Testul care documenteaza de ce rezerva locala a fost stearsa din `ProductCard`
  // si din cautare, in loc sa fie pastrata „pentru siguranta".
  const slim = slimCatalogProduct(rand([{ title: "S", enabled: true, price: 438 }]));
  const recalculat = getProductPriceRange(Number(slim.price), slim.page_sections);
  assert.equal(recalculat.faraOferta, true);
  assert.notDeepEqual(recalculat, slim.price_range);
});

test("un produs simplu ramane pe pretul lui", () => {
  const slim = slimCatalogProduct({ price: 49.9, description: null, images: [], page_sections: null });
  assert.deepEqual(slim.price_range, { min: 49.9, max: 49.9, hasRange: false, faraOferta: false });
});

test("descrierea de cautare pleaca fara marcaj, ca sa nu se rupa cuvintele", () => {
  // 925 din 1049 de descrieri ale unui magazin real contin HTML. Taiate direct,
  // bugetul de 300 de caractere se ducea pe etichete, iar cuvintele erau rupte
  // in doua — deci cautarea nu le mai gasea intregi.
  const r = slimCatalogProduct({
    price: 10,
    description: "<p>Manusi <strong>protectie</strong>   taiere</p>",
    images: [],
    page_sections: null,
  });
  assert.equal(r.description, "Manusi protectie taiere");
});

test("descrierea fara marcaj ramane neatinsa", () => {
  const r = slimCatalogProduct({ price: 10, description: "text simplu", images: [], page_sections: null });
  assert.equal(r.description, "text simplu");
});

test("trunchierea se face DUPA curatare, pe text real", () => {
  const brut = "<p>" + "a".repeat(500) + "</p>";
  const r = slimCatalogProduct({ price: 10, description: brut, images: [], page_sections: null });
  assert.equal(r.description?.length, 300, "300 de caractere de text, nu de marcaj");
  assert.ok(!r.description?.includes("<"), "niciun rest de eticheta");
});
