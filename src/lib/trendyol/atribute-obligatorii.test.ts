import assert from "node:assert/strict";
import { test } from "node:test";
import { atributeObligatoriiLipsa, mesajAtributeLipsa } from "./atribute-obligatorii";
import type { TrendyolCategoryAttribute, TrendyolProductAttribute } from "./types";

function cat(id: number, nume: string, obligatoriu: boolean, extra: Record<string, unknown> = {}): TrendyolCategoryAttribute {
  return { attribute: { id, name: nume }, required: obligatoriu, allowCustom: true, ...extra } as TrendyolCategoryAttribute;
}

test("atributul obligatoriu lipsa e raportat cu NUMELE lui", () => {
  // Numele e tot rostul verificarii: „lipseste atributul 47" nu-i spune nimic
  // comerciantului. Exact asta intorcea Trendyol, ore mai tarziu, pe lot.
  const lipsa = atributeObligatoriiLipsa([cat(47, "Culoare", true)], []);
  assert.equal(lipsa.length, 1);
  assert.equal(lipsa[0].nume, "Culoare");
  assert.equal(lipsa[0].attributeId, 47);
});

test("atributul optional lipsa NU blocheaza", () => {
  assert.deepEqual(atributeObligatoriiLipsa([cat(9, "Material", false)], []), []);
});

test("`isRequired` e acceptat la fel ca `required`", () => {
  // Trendyol foloseste amandoua formele, dupa versiunea documentatiei — iar
  // Romania e pe v3.0 international, care difera de cea turceasca.
  const lipsa = atributeObligatoriiLipsa(
    [{ attribute: { id: 3, name: "Gen" }, isRequired: true } as unknown as TrendyolCategoryAttribute], []);
  assert.equal(lipsa[0]?.nume, "Gen");
});

test("o valoare din lista SAU un text liber amandoua conteaza ca prezente", () => {
  const atribute = [cat(1, "Culoare", true), cat(2, "Material", true)];
  const puse: TrendyolProductAttribute[] = [
    { attributeId: 1, attributeValueId: 55 },
    { attributeId: 2, customAttributeValue: "bumbac" },
  ];
  assert.deepEqual(atributeObligatoriiLipsa(atribute, puse), []);
});

test("cheia fara valoare NU conteaza ca prezenta", () => {
  /*
   * Cazul care ar fi trecut nevazut: atributul apare in payload, dar gol. Trendyol
   * il respinge la fel ca pe unul lipsa, iar noi l-am fi crezut completat.
   */
  const atribute = [cat(1, "Culoare", true), cat(2, "Material", true), cat(3, "Gen", true)];
  const puse: TrendyolProductAttribute[] = [
    { attributeId: 1, customAttributeValue: "   " },
    { attributeId: 2, attributeValueId: 0 },
    { attributeId: 3 },
  ];
  assert.deepEqual(atributeObligatoriiLipsa(atribute, puse).map((l) => l.nume), ["Culoare", "Material", "Gen"]);
});

test("mesajul le enumera pe TOATE, nu doar pe prima", () => {
  /*
   * Trimise una cate una, comerciantul ar fi completat „Culoare", ar fi
   * reincercat, si ar fi aflat abia atunci ca mai lipseste „Material" — cate un
   * dus-intors la marketplace pentru fiecare atribut.
   */
  const m = mesajAtributeLipsa(atributeObligatoriiLipsa(
    [cat(1, "Culoare", true), cat(2, "Material", true), cat(3, "Gen", true)], []));
  assert.ok(m.includes("Culoare"));
  assert.ok(m.includes("Material"));
  assert.ok(m.includes("Gen"));
});

test("fara nimic lipsa, mesajul e gol", () => {
  assert.equal(mesajAtributeLipsa([]), "");
});
