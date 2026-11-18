import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";

/*
 * theMarketer TINE COSUL DIN EVENIMENTE (18.11.2026).
 *
 * ⚠ CE S-A VAZUT IN VITRINA: scaderea cantitatii din cos nu spunea nimic. „Adaugat de doua ori, scazut la 1,
 * apoi sters” ajungea la ei ca +1 +1 -1, adica o bucata FANTOMA ramasa in cos, iar cumparatorul putea primi
 * email de cos abandonat pentru un produs pe care il scosese. Acum fiecare schimbare pleaca drept diferenta,
 * din `CartProvider`, singurul loc prin care trec toate cosurile.
 */

type Ev = { event: string; product_id?: string; quantity?: number; variation?: { id: string; sku: string } };
const w = { __edinioMktr: { captura: false }, dataLayer: [] as Ev[] };
let T: typeof import("./track-add");

before(async () => {
  (globalThis as unknown as { window: unknown }).window = w;
  T = await import("./track-add");
});
beforeEach(() => { w.dataLayer = []; });

const ev = () => w.dataLayer.filter((e) => e.event.startsWith("__sm__"));
/** Ce crede theMarketer ca e in cos, din evenimentele primite. */
const inCos = () => ev().reduce((s, e) => s + (e.event === "__sm__add_to_cart" ? 1 : -1) * (e.quantity ?? 0), 0);

test("⚠⚠ adaugat de doua ori, scazut la 1, apoi sters: la theMarketer cosul ramane GOL", () => {
  const linie = { productId: "p1", quantity: 0 };
  T.trackCantitateTM(linie, 1);
  T.trackCantitateTM({ ...linie, quantity: 1 }, 2);
  T.trackCantitateTM({ ...linie, quantity: 2 }, 1);
  T.trackCantitateTM({ ...linie, quantity: 1 }, 0);
  assert.equal(inCos(), 0);
  assert.deepEqual(ev().map((e) => [e.event, e.quantity]), [
    ["__sm__add_to_cart", 1], ["__sm__add_to_cart", 1], ["__sm__remove_from_cart", 1], ["__sm__remove_from_cart", 1],
  ]);
});

test("diferenta, nu cantitatea noua; nicio schimbare, niciun eveniment", () => {
  T.trackCantitateTM({ productId: "p1", quantity: 5 }, 2);
  assert.deepEqual(ev(), [{ event: "__sm__remove_from_cart", product_id: "p1", quantity: 3 }]);
  w.dataLayer = [];
  T.trackCantitateTM({ productId: "p1", quantity: 2 }, 2);
  assert.equal(ev().length, 0);
});

test("varianta pleaca cu aceeasi identitate ca la adaugare", () => {
  T.trackCantitateTM({ productId: "p1", quantity: 1, variantTitle: "Alb mat", variantSku: "SKU-AL" }, 0);
  assert.deepEqual(ev()[0].variation, { id: "p1-alb-mat", sku: "SKU-AL" });
});

test("cosul trimite diferenta din CartProvider, si o singura data", () => {
  const viu = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const p = viu("src/components/storefront/cart/CartProvider.tsx");
  const corp = (nume: string) => p.slice(p.indexOf(`function ${nume}(`), p.indexOf("\n  }\n", p.indexOf(`function ${nume}(`)));
  assert.match(corp("removeItem"), /if \(linie\) trackCantitateTM\(linie, 0\);/);
  assert.match(corp("updateQty"), /if \(linie\) trackCantitateTM\(linie, n\);/);
  assert.match(corp("replaceItem"), /if \(veche\) trackCantitateTM\(veche, 0\);\s+trackCantitateTM\(\{ \.\.\.item, quantity: 0 \}, normalizeazaCantitate\(cantitate\)\);/);
  /* Butoanele de stergere cheama `removeItem`: daca ar trimite si ele, evenimentul ar pleca de doua ori. */
  for (const f of ["src/components/storefront/sections/cart/CartDrawerClassic.tsx", "src/components/storefront/sections/cart/_shared/CartPieces.tsx"]) {
    assert.ok(!/__sm__remove_from_cart|trackCantitateTM|trackRemoveFromCartTM/.test(viu(f)), f);
  }
});

test("⚠ fereastra de comanda din sertarul paginilor fara catalog trimite evenimentele de palnie, ca pe pagina de magazin", () => {
  const viu = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const s = viu("src/components/storefront/StoreCartPanels.tsx");
  const dupaDeschidere = s.slice(s.indexOf("deschideComanda();"));
  assert.match(dupaDeschidere, /fbTrack\("InitiateCheckout", \{\s*value: total, currency: "RON", num_items: count,\s*\.\.\.continutDinCos\(/);
  assert.match(dupaDeschidere, /ttqTrack\("InitiateCheckout", \{[\s\S]{0,160}\.\.\.continutTikTokDinCos\(/);
  assert.match(dupaDeschidere, /gtagEvent\("begin_checkout", \{ currency: "RON", value: total, items: items\.map\(\(i\) => \(\{ item_id: i\.productId, item_name: i\.name, price: lineUnit\(i\), quantity: i\.quantity \}\)\) \}\);/);
  assert.match(dupaDeschidere, /mktrEvent\("__sm__initiate_checkout"\);/);
  /* Drumul spre pagina de finalizare NU trimite: acolo le trimite pagina la incarcare. */
  const redirect = s.slice(s.indexOf("if (comandaPePagina) {"), s.indexOf("deschideComanda();"));
  assert.ok(!/fbTrack|ttqTrack|gtagEvent|mktrEvent/.test(redirect));
});
