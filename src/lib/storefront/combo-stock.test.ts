import assert from "node:assert/strict";
import { test } from "node:test";
import { comboStockMap } from "./variants";

/**
 * Stocul pe combinatie exista in date de la inceput, dar nu-l citea nimeni: un
 * produs cu 40 de bucati in total lasa sa se comande o marime cu zero. Harta
 * asta e ce sta acum intre client si o comanda pe care comerciantul n-o poate
 * onora, deci are teste.
 */

const sectiuni = (combinatii: unknown[]) => ({
  variants: {
    enabled: true,
    options: [{ id: "o1", name: "Marime", values: ["S", "M"] }],
    combinations: combinatii,
  },
});

const c = (title: string, stock: unknown, enabled = true) =>
  ({ id: title, title, price: "", compare_at_price: "", sku: "", stock_quantity: stock, image: "", enabled });

test("citeste stocul declarat al fiecarei combinatii active", () => {
  const m = comboStockMap(sectiuni([c("S", "0"), c("M", "12")]));
  assert.equal(m.get("S"), 0);
  assert.equal(m.get("M"), 12);
});

test("combinatiile fara stoc completat lipsesc, ca sa cada pe stocul produsului", () => {
  const m = comboStockMap(sectiuni([c("S", ""), c("M", "  ")]));
  assert.equal(m.has("S"), false);
  assert.equal(m.has("M"), false);
});

test("combinatiile dezactivate nu intra", () => {
  const m = comboStockMap(sectiuni([c("S", "5", false)]));
  assert.equal(m.has("S"), false);
});

test("valorile fara sens se ignora, nu devin zero", () => {
  const m = comboStockMap(sectiuni([c("S", "multe"), c("M", "-3")]));
  assert.equal(m.has("S"), false, "un text nu inseamna stoc epuizat");
  assert.equal(m.has("M"), false, "un numar negativ nu inseamna stoc epuizat");
});

test("zecimalele se rotunjesc in jos", () => {
  const m = comboStockMap(sectiuni([c("S", "2.9")]));
  assert.equal(m.get("S"), 2);
});

test("un produs fara variante da o harta goala", () => {
  assert.equal(comboStockMap({}).size, 0);
  assert.equal(comboStockMap(null).size, 0);
});
