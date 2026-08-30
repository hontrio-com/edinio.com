import { strict as assert } from "node:assert";
import { test } from "node:test";
import { etichetaOferta, ofertePosibile, pretCuTva, termenLivrare } from "./preturi";
import type { OfertaInnoship } from "./client";

function oferta(peste: Partial<OfertaInnoship> = {}): OfertaInnoship {
  return {
    carrierId: 1, carrier: "Cargus", serviceId: 1, service: "Standard",
    rateAmount: 20, rateVatAmount: 3.8, rateTotalAmount: 23.8, rateCurrency: "RON",
    optionId: "opt-1", calculatedBusinessDays: 2,
    ...peste,
  };
}

// ─── Pretul ───────────────────────────────────────────────────────────────────

test("⚠ pretul care ajunge la cumparator e CEL CU TVA", () => {
  /* Preturile din checkout-ul nostru sunt toate cu TVA inclus. Afisat fara, ar fi
     cu ~19% mai mic decat cel incasat. */
  assert.equal(pretCuTva(oferta()), 23.8);
});

test("fara total, se compune din net plus TVA", () => {
  assert.equal(pretCuTva(oferta({ rateTotalAmount: undefined })), 23.8);
});

test("fara TVA, ramane netul — si se stie ca e o aproximatie", () => {
  assert.equal(pretCuTva(oferta({ rateTotalAmount: undefined, rateVatAmount: undefined })), 20);
});

test("o oferta fara niciun pret nu se poate arata", () => {
  assert.equal(pretCuTva(oferta({ rateTotalAmount: 0, rateAmount: 0 })), null);
});

// ─── Eticheta ─────────────────────────────────────────────────────────────────

test("eticheta pune curierul inaintea serviciului", () => {
  assert.equal(etichetaOferta(oferta()), "Cargus · Standard");
});

test("fara serviciu se foloseste numele optiunii", () => {
  assert.equal(etichetaOferta(oferta({ service: null, optionName: "Next Day" })), "Cargus · Next Day");
});

test("fara nimic, un text neutru — nu un rand gol in lista de livrare", () => {
  assert.equal(etichetaOferta(oferta({ carrier: null, service: null, optionName: null })), "Livrare prin Innoship");
});

// ─── Ofertele ─────────────────────────────────────────────────────────────────

test("o oferta intreaga trece si isi pastreaza cheia compusa", () => {
  const [o] = ofertePosibile([oferta()]);
  assert.equal(o.courierId, 1);
  assert.equal(o.serviceId, 1);
  assert.equal(o.optionId, "opt-1");
  assert.equal(o.pret, 23.8);
  assert.equal(o.zileLivrare, 2);
});

test("⚠ o oferta fara una din cele trei parti ale cheii se ARUNCA", () => {
  /* Fara ele, alegerea cumparatorului nu poate fi dusa pana la emitere: s-ar
     pierde tacut intre checkout si AWB. */
  assert.equal(ofertePosibile([oferta({ carrierId: undefined })]).length, 0);
  assert.equal(ofertePosibile([oferta({ serviceId: 0 })]).length, 0);
});

test("optiunea lipsa e in regula: cheia ramane curier + serviciu", () => {
  const [o] = ofertePosibile([oferta({ optionId: null })]);
  assert.equal(o.optionId, null);
});

test("⚠ filtrul pe curieri: gol inseamna TOTI, nu NICIUNUL", () => {
  const rates = [oferta({ carrierId: 1 }), oferta({ carrierId: 2, optionId: "opt-2" })];
  assert.equal(ofertePosibile(rates).length, 2);
  assert.equal(ofertePosibile(rates, { curieri_permisi: [] }).length, 2);
});

test("filtrul pe curieri taie ce n-a ales comerciantul", () => {
  const rates = [oferta({ carrierId: 1 }), oferta({ carrierId: 2, optionId: "opt-2" })];
  const doar = ofertePosibile(rates, { curieri_permisi: [2] });
  assert.equal(doar.length, 1);
  assert.equal(doar[0].courierId, 2);
});

test("aceeasi oferta de doua ori apare o singura data", () => {
  assert.equal(ofertePosibile([oferta(), oferta()]).length, 1);
});

test("acelasi curier cu servicii diferite ramane de doua ori", () => {
  const rates = [oferta({ serviceId: 1 }), oferta({ serviceId: 3, optionId: "opt-l" })];
  assert.equal(ofertePosibile(rates).length, 2);
});

test("⚠ ordinea e dupa PRET, nu dupa clasarea lor", () => {
  /* Innoship isi are `score`/`priority`, dar aia e o recomandare pentru
     comerciant. Checkout-ul nostru sorteaza peste tot dupa pret, iar doua reguli
     de sortare in acelasi ecran ar face lista de neinteles. */
  const rates = [
    oferta({ carrierId: 1, rateTotalAmount: 30, priority: 1, score: 99 }),
    oferta({ carrierId: 2, rateTotalAmount: 18, priority: 9, score: 1, optionId: "opt-2" }),
  ];
  assert.deepEqual(ofertePosibile(rates).map((o) => o.pret), [18, 30]);
});

test("o lista goala sau lipsa nu arunca", () => {
  assert.deepEqual(ofertePosibile([]), []);
  assert.deepEqual(ofertePosibile(undefined as never), []);
});

// ─── Termenul ─────────────────────────────────────────────────────────────────

test("termenul se scrie in romana, cu singular corect", () => {
  assert.equal(termenLivrare({ ...ofertePosibile([oferta({ calculatedBusinessDays: 1 })])[0] }), "1 zi lucratoare");
  assert.equal(termenLivrare({ ...ofertePosibile([oferta()])[0] }), "2 zile lucratoare");
});

test("fara termen nu se inventeaza unul", () => {
  const [o] = ofertePosibile([oferta({ calculatedBusinessDays: null, deliveryDays: 0 })]);
  assert.equal(o.zileLivrare, null);
  assert.equal(termenLivrare(o), undefined);
});
