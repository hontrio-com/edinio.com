import assert from "node:assert/strict";
import { test } from "node:test";
import { masuraDinText, potrivesteValoare, sugereazaAtribute, type DateFirma, type DateProdus } from "./attribute-autofill";
import type { TrendyolCategoryAttribute } from "./types";

const FIRMA: DateFirma = {
  nume: "Hiskin Cosmetics SRL",
  email: "contact@hiskin.ro",
  adresa: "Str. Florilor 12",
  oras: "Cluj-Napoca",
  judet: "Cluj",
  cui: "RO12345678",
  tara: "România",
};

const PRODUS: DateProdus = {
  nume: "Puzzle Gel de duș + Cremă de corp Hiskin 250 ml",
  descriere: "Set de îngrijire cu gel de duș și cremă de corp.",
  brand: "Hiskin",
  gtin: "5901234123457",
  weightGrams: 300,
};

function attr(id: number, name: string, extra: Partial<TrendyolCategoryAttribute> = {}): TrendyolCategoryAttribute {
  return { attribute: { id, name }, required: false, allowCustom: true, ...extra };
}

function gaseste(sugestii: ReturnType<typeof sugereazaAtribute>, id: number) {
  return sugestii.find((s) => s.attributeId === id);
}

// ── Fapte despre firmă ────────────────────────────────────────────────────────
test("numele producatorului si al importatorului vin din datele firmei", () => {
  const s = sugereazaAtribute(
    [attr(1, "Numele producătorului"), attr(2, "Numele importatorului principal")], {}, FIRMA, PRODUS,
  );
  assert.equal(gaseste(s, 1)?.customAttributeValue, "Hiskin Cosmetics SRL");
  assert.equal(gaseste(s, 2)?.customAttributeValue, "Hiskin Cosmetics SRL");
  assert.equal(gaseste(s, 1)?.sursa, "firma");
});

test("adresele de e-mail vin din e-mailul firmei", () => {
  const s = sugereazaAtribute(
    [attr(1, "Adresa de e-mail a producătorului"), attr(2, "Adresa de e-mail a importatorului terț")], {}, FIRMA, PRODUS,
  );
  assert.equal(gaseste(s, 1)?.customAttributeValue, "contact@hiskin.ro");
  assert.equal(gaseste(s, 2)?.customAttributeValue, "contact@hiskin.ro");
});

test("adresa completa se compune din sediu, oras, judet si tara", () => {
  const s = sugereazaAtribute([attr(1, "Informații privind adresa importatorului principal")], {}, FIRMA, PRODUS);
  assert.equal(gaseste(s, 1)?.customAttributeValue, "Str. Florilor 12, Cluj-Napoca, Cluj, România");
});

test("merge si pe denumirile in engleza", () => {
  const s = sugereazaAtribute([attr(1, "Manufacturer name"), attr(2, "Importer address")], {}, FIRMA, PRODUS);
  assert.equal(gaseste(s, 1)?.customAttributeValue, "Hiskin Cosmetics SRL");
  assert.ok(gaseste(s, 2)?.customAttributeValue?.includes("Str. Florilor 12"));
});

test("fara date de firma nu inventeaza nimic", () => {
  const goala: DateFirma = { nume: "", email: null, adresa: null, oras: null, judet: null, cui: null, tara: "România" };
  const s = sugereazaAtribute([attr(1, "Adresa de e-mail a producătorului")], {}, goala, { ...PRODUS, nume: "X", descriere: null });
  assert.equal(gaseste(s, 1), undefined);
});

// ── Presupuneri din produs ────────────────────────────────────────────────────
test("masura e extrasa din numele produsului", () => {
  assert.equal(masuraDinText("Gel de duș 250 ml"), "250 ml");
  assert.equal(masuraDinText("Detergent 1,5 L"), "1.5 l");
  assert.equal(masuraDinText("Fara masura"), null);
});

test("volumul se ia din numele produsului", () => {
  const s = sugereazaAtribute([attr(1, "Volum")], {}, FIRMA, PRODUS);
  assert.equal(gaseste(s, 1)?.customAttributeValue, "250 ml");
  assert.equal(gaseste(s, 1)?.sursa, "produs");
});

test("originea si brandul sunt propuse ca presupuneri", () => {
  const s = sugereazaAtribute([attr(1, "Origine"), attr(2, "Marca")], {}, FIRMA, PRODUS);
  assert.equal(gaseste(s, 1)?.customAttributeValue, "România");
  assert.equal(gaseste(s, 2)?.customAttributeValue, "Hiskin");
});

test("o valoare din lista e aleasa cand se potriveste exact", () => {
  const valori = { 1: [{ attributeValueId: 9, attributeValue: "România" }, { attributeValueId: 10, attributeValue: "Turcia" }] };
  const s = sugereazaAtribute([attr(1, "Origine", { allowCustom: false })], valori, FIRMA, PRODUS);
  assert.equal(gaseste(s, 1)?.attributeValueId, 9);
  assert.equal(gaseste(s, 1)?.customAttributeValue, undefined);
});

test("atributele fara regula se completeaza din textul produsului, cand e o singura potrivire", () => {
  const valori = { 5: [{ attributeValueId: 1, attributeValue: "Gel" }, { attributeValueId: 2, attributeValue: "Spumă" }] };
  const s = sugereazaAtribute([attr(5, "Formular", { allowCustom: false })], valori, FIRMA, PRODUS);
  assert.equal(gaseste(s, 5)?.attributeValueId, 1);
});

// ── Ce NU are voie sa se intample ─────────────────────────────────────────────
test("cand se potrivesc doua optiuni, nu alegem niciuna", () => {
  const optiuni = [
    { attributeValueId: 1, attributeValue: "Gel" },
    { attributeValueId: 2, attributeValue: "Cremă" },
  ];
  // Produsul contine si „gel", si „cremă" — orice alegere ar fi pe ghicite.
  assert.equal(potrivesteValoare(PRODUS.nume + " " + PRODUS.descriere, optiuni), null);
  const s = sugereazaAtribute([attr(5, "Formular", { allowCustom: false })], { 5: optiuni }, FIRMA, PRODUS);
  assert.equal(gaseste(s, 5), undefined);
});

test("nu trimitem text liber unde categoria nu il accepta", () => {
  const valori = { 1: [{ attributeValueId: 9, attributeValue: "Turcia" }] };
  const s = sugereazaAtribute([attr(1, "Origine", { allowCustom: false })], valori, FIRMA, PRODUS);
  // „România" nu e in lista si textul liber nu e permis: mai bine gol decat gresit.
  assert.equal(gaseste(s, 1), undefined);
});

test("ingredientele nu se inventeaza din descriere", () => {
  const s = sugereazaAtribute([attr(7, "Ingrediente")], {}, FIRMA, PRODUS);
  assert.equal(gaseste(s, 7), undefined);
});

test("un produs fara brand nu primeste brand", () => {
  const s = sugereazaAtribute([attr(2, "Marca")], {}, FIRMA, { ...PRODUS, brand: null, nume: "Produs", descriere: null });
  assert.equal(gaseste(s, 2), undefined);
});
