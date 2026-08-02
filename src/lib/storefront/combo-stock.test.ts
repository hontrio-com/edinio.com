import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combinatiiActiveUnice,
  comboEpuizat,
  comboStock,
  comboStockMap,
  enabledComboPriceMap,
  findCombo,
  isValueAvailable,
  parseVariants,
  toateCombinatiileEpuizate,
} from "./variants";

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

test("la titluri duplicate conteaza PRIMA combinatie, ca la pret", () => {
  // In productie sunt 129 de perechi (produs, titlu) duplicate. Pretul platit
  // vine de la prima (`findCombo`), si tot din prima scade baza de date dupa
  // comanda. Citind-o pe ultima, verificarea putea aproba din stocul altei
  // combinatii decat cea vanduta.
  const m = comboStockMap(sectiuni([c("S", "0"), c("S", "9")]));
  assert.equal(m.get("S"), 0);
});

test("prima combinatie fara stoc completat nu blocheaza citirea urmatoarei", () => {
  // Cea fara numar nu declara nimic, deci nu are ce sa ascunda. Baza de date
  // face la fel: sare peste ea si scade tot din prima care are numar.
  const m = comboStockMap(sectiuni([c("S", ""), c("S", "4")]));
  assert.equal(m.get("S"), 4);
});

/**
 * Titlurile duplicate: TOATE partile trebuie sa se uite la ACEEASI combinatie.
 *
 * In productie sunt 31 de titluri duplicate pe 7 produse. Pe GEACA VISION de la
 * eSAFE, „NEGRU / L" apare de doua ori, cu 203 si cu 231 de lei. Pretul, stocul
 * si oferta din feed veneau din randuri diferite ale aceluiasi titlu: pagina
 * arata 203 si comanda intra cu 231, iar din pagina produsului verificarea de
 * pret respingea diferenta, deci produsul nu se putea comanda deloc.
 */
const dublat = () => sectiuni([
  { id: "negru-l", title: "NEGRU / L", price: "203", compare_at_price: "", sku: "", stock_quantity: "36", image: "", enabled: true },
  { id: "negru-l", title: "NEGRU / L", price: "231", compare_at_price: "", sku: "", stock_quantity: "13", image: "", enabled: true },
]);

test("pretul vine din PRIMA combinatie, ca si combinatia aleasa de client", () => {
  const v = parseVariants(dublat())!;
  assert.equal(findCombo(v, "NEGRU / L")?.price, "203", "clientul vede prima");
  assert.equal(enabledComboPriceMap(dublat(), 100).get("NEGRU / L"), 203, "si tot prima se incaseaza");
});

test("pretul, stocul si oferta din feed se uita la acelasi rand", () => {
  assert.equal(enabledComboPriceMap(dublat(), 100).get("NEGRU / L"), 203);
  assert.equal(comboStockMap(dublat()).get("NEGRU / L"), 36);
  assert.deepEqual(
    combinatiiActiveUnice(parseVariants(dublat())).map((c) => c.price),
    ["203"],
    "o singura oferta pe titlu, altfel a doua o suprascrie pe prima la Google",
  );
});

test("fara duplicate, nimic nu se schimba", () => {
  const v = parseVariants(sectiuni([c("S", "5"), c("M", "12")]))!;
  assert.deepEqual(combinatiiActiveUnice(v).map((x) => x.title), ["S", "M"]);
});

test("combinatiile dezactivate nu ies in lista unica", () => {
  const v = parseVariants(sectiuni([c("S", "5", false), c("M", "12")]))!;
  assert.deepEqual(combinatiiActiveUnice(v).map((x) => x.title), ["M"]);
});

test("un produs fara variante da o harta goala", () => {
  assert.equal(comboStockMap({}).size, 0);
  assert.equal(comboStockMap(null).size, 0);
});

/**
 * Partea a doua: ce vede CLIENTUL.
 *
 * Harta de mai sus statea intre client si o comanda imposibila doar pe calea
 * cosului. In pagina, o marime cu zero arata la fel ca una plina: se alegea, se
 * punea in cos si, prin formularul de comanda directa, chiar ajungea comanda.
 * Acum stocul taie optiunea inca de la alegere.
 */

const variante = (combinatii: unknown[]) => parseVariants(sectiuni(combinatii))!;

test("o marime cu stoc zero nu se mai poate alege", () => {
  const v = variante([c("S", "0"), c("M", "12")]);
  assert.equal(isValueAvailable(v, {}, "Marime", "S"), false);
  assert.equal(isValueAvailable(v, {}, "Marime", "M"), true);
});

test("o marime fara stoc completat ramane de ales", () => {
  // Campul gol inseamna „nu tin socoteala aici", deci ramane stocul produsului.
  const v = variante([c("S", ""), c("M", "12")]);
  assert.equal(isValueAvailable(v, {}, "Marime", "S"), true);
});

test("pe doua axe, stocul taie doar combinatia epuizata", () => {
  // 160x200 exista in doua culori: Alb s-a terminat, Negru nu. Marimea ramane
  // de ales, dar dupa ce o alegi, Alb nu mai e.
  const peDouaAxe = {
    variants: {
      enabled: true,
      options: [
        { id: "o1", name: "Marime", values: ["160x200", "140x200"] },
        { id: "o2", name: "Culoare", values: ["Alb", "Negru"] },
      ],
      combinations: [
        c("160x200 / Alb", "0"),
        c("160x200 / Negru", "4"),
        c("140x200 / Alb", "7"),
      ],
    },
  };
  const v = parseVariants(peDouaAxe)!;
  assert.equal(isValueAvailable(v, {}, "Marime", "160x200"), true, "mai e o culoare cu stoc");
  assert.equal(isValueAvailable(v, { Marime: "160x200" }, "Culoare", "Alb"), false);
  assert.equal(isValueAvailable(v, { Marime: "160x200" }, "Culoare", "Negru"), true);
  assert.equal(isValueAvailable(v, { Marime: "140x200" }, "Culoare", "Alb"), true);
});

test("stocul unei combinatii: numarul, sau nimic cand nu e declarat", () => {
  assert.equal(comboStock(c("S", "0") as never), 0);
  assert.equal(comboStock(c("S", "3") as never), 3);
  assert.equal(comboStock(c("S", "") as never), null);
  assert.equal(comboStock(c("S", "multe") as never), null);
  assert.equal(comboStock(null), null);
});

test("epuizat inseamna zero declarat, nu lipsa declaratiei", () => {
  assert.equal(comboEpuizat(c("S", "0") as never), true);
  assert.equal(comboEpuizat(c("S", "") as never), false);
  assert.equal(comboEpuizat(c("S", "1") as never), false);
});

test("cand toate variantele s-au terminat, pagina o poate spune", () => {
  assert.equal(toateCombinatiileEpuizate(variante([c("S", "0"), c("M", "0")])), true);
  assert.equal(toateCombinatiileEpuizate(variante([c("S", "0"), c("M", "1")])), false);
  // Una fara stoc completat inseamna ca produsul inca se vinde.
  assert.equal(toateCombinatiileEpuizate(variante([c("S", "0"), c("M", "")])), false);
  // Cele dezactivate nu conteaza: ele oricum nu se pot alege.
  assert.equal(toateCombinatiileEpuizate(variante([c("S", "0"), c("M", "5", false)])), true);
  assert.equal(toateCombinatiileEpuizate(null), false);
});
