import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCartPricing } from "./pricing";
import { computeVat, vatBase } from "@/lib/utils/vat";

/**
 * Numerele astea se vad in patru locuri deodata (sertar, trei modele de pagina
 * de cos) si trebuie sa fie identice in toate. Rulare: `npm test`.
 */

const de = (over: Partial<Parameters<typeof computeCartPricing>[0]> = {}) =>
  computeCartPricing({ total: 100, shippingCost: 20, freeShippingThreshold: null, minOrderAmount: null, ...over });

test("fara prag, transportul se plateste intotdeauna", () => {
  const p = de();
  assert.equal(p.shipping, 20);
  assert.equal(p.shippingIsFree, false);
  assert.equal(p.grandTotal, 120);
  // Fara prag nu exista drum de parcurs: bara se deseneaza plina, nu goala.
  assert.equal(p.freeShippingPct, 100);
  assert.equal(p.freeShippingRemaining, 0);
});

test("pragul atins face transportul gratuit", () => {
  const p = de({ total: 300, freeShippingThreshold: 300 });
  assert.equal(p.shipping, 0);
  assert.equal(p.shippingIsFree, true);
  assert.equal(p.grandTotal, 300);
  assert.equal(p.freeShippingRemaining, 0);
  assert.equal(p.freeShippingPct, 100);
});

test("sub prag se arata cat mai lipseste si cat s-a parcurs", () => {
  const p = de({ total: 240, freeShippingThreshold: 300 });
  assert.equal(p.shipping, 20);
  assert.equal(p.freeShippingRemaining, 60);
  assert.equal(p.freeShippingPct, 80);
});

test("un prag de zero inseamna fara prag, nu transport gratuit mereu", () => {
  // In baza, „fara prag" ajunge si ca null si ca 0; ar fi absurd ca 0 sa dea
  // livrare gratuita la orice comanda, inclusiv la un cos gol.
  const p = de({ total: 0, freeShippingThreshold: 0 });
  assert.equal(p.shipping, 20);
  assert.equal(p.shippingIsFree, false);
});

test("comanda minima blocheaza finalizarea si spune cat lipseste", () => {
  const p = de({ total: 80, minOrderAmount: 150 });
  assert.equal(p.belowMinOrder, true);
  assert.equal(p.minOrderRemaining, 70);

  const peste = de({ total: 150, minOrderAmount: 150 });
  assert.equal(peste.belowMinOrder, false);
  assert.equal(peste.minOrderRemaining, 0);
});

test("progresul nu trece de suta la un cos peste prag", () => {
  assert.equal(de({ total: 900, freeShippingThreshold: 300 }).freeShippingPct, 100);
});

/* ─── TVA-ul transportului ────────────────────────────────────────────────── */

/**
 * Cosul isi calcula singur TVA-ul, direct pe marfa, in loc sa treaca prin
 * `vatBase`. Era singura suprafata de pret pe care compilatorul NU o semnala cand
 * se schimba regula: dupa ce transportul a intrat in baza, sertarul si cele trei
 * pagini de cos ar fi ramas cu vechiul numar, iar finalizarea ar fi incasat altul.
 */

const NET = { vat_enabled: true, vat_rate: 21, prices_include_vat: false, show_vat_breakdown: true };
const BRUT = { vat_enabled: true, vat_rate: 21, prices_include_vat: true, show_vat_breakdown: true };

test("preturi FARA TVA: transportul isi poarta TVA-ul si in cos", () => {
  // Cazul eSAFE: 500 marfa + 45 transport. Serverul incaseaza 659,45, deci si
  // cosul trebuie sa scrie 659,45 — nu 650,00, cum scria pana acum.
  const p = de({ total: 500, shippingCost: 45, freeShippingThreshold: 999, vat: NET });
  assert.equal(p.shipping, 45);
  assert.equal(p.vatAmount, 114.45);
  assert.equal(p.grandTotal, 659.45);
});

test("preturi CU TVA: totalul din cos ramane neatins, se corecteaza doar TVA-ul aratat", () => {
  const p = de({ total: 40, shippingCost: 20, vat: BRUT });
  assert.equal(p.grandTotal, 60, "clientul plateste acelasi pret ca inainte");
  assert.equal(p.vatAmount, 10.41, "iar linia de TVA spune in sfarsit ce spune si factura");
});

test("peste prag, transportul gratuit nu adauga niciun TVA", () => {
  const p = de({ total: 1000, shippingCost: 45, freeShippingThreshold: 999, vat: NET });
  assert.equal(p.shipping, 0);
  assert.equal(p.vatAmount, 210);
  assert.equal(p.grandTotal, 1210);
});

test("cosul si finalizarea compun totalul din aceleasi bucati", () => {
  // Aceleasi intrari, lantul din `checkout-core` scris de mana: daca cele doua
  // se despart, clientul vede un numar in cos si altul la finalizare.
  const total = 500, shipping = 45;
  const p = de({ total, shippingCost: shipping, freeShippingThreshold: 999, vat: NET });
  const baza = vatBase({ goods: total, extras: 0, shipping, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0 });
  const { vatAddOn } = computeVat(baza, NET);
  assert.equal(p.grandTotal, Math.round((total + shipping + vatAddOn) * 100) / 100);
});
