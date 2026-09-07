import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pretulBucatii, pretulLiniei, type RegulaPretCos } from "./pret-linie";
import type { CartItem } from "./normalize";

/**
 * Cosul si serverul trebuie sa spuna ACELASI numar.
 *
 * ═══ ⚠ CE A COSTAT LIPSA PROBEI ═══
 *
 * Personalizarea a intrat in cos, `placeCartOrder` a inceput sa repretuiasca fiecare linie — si
 * jumatatea din browser a ramas pe pretul de CATALOG. Fototapetul se vedea cu 89 de lei in cos si
 * in pagina de finalizare, si se scria in comanda cu 910: clientul confirma o suma si i se cerea
 * alta la usa, iar coletul pleca asigurat pe 89.
 *
 * N-avea ce sa prinda asta: socoteala traia intr-o componenta React, iar proiectul n-are jsdom.
 * De-aia formula s-a mutat intr-un modul pur, iar proba de aici o masoara ca PURTARE, cu cifre
 * scrise de mana — nu cu aceleasi functii puse in oglinda, care ar fi trecut si daca amandoua
 * partile ar fi gresit la fel.
 */

const FOTOTAPET: RegulaPretCos = {
  price: 89,
  combos: {},
  tiers: null,
  customization: {
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ] },
      { id: "prot", type: "comutator", label: "Protectie", required: false,
        impact: { fel: "pe_m2", suma: 15 } },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
      includePretulProdusului: false },
  },
};

/** Cana gravata: pretul de catalog SE incaseaza, iar cutia cadou adauga o suma fixa. */
const CANA: RegulaPretCos = {
  price: 89,
  combos: {},
  tiers: null,
  customization: {
    enabled: true,
    fields: [
      { id: "text", type: "text", label: "Textul gravat", required: true },
      { id: "cutie", type: "comutator", label: "Cutie cadou", required: false,
        impact: { fel: "fix", suma: 25 } },
    ],
    pret: { fel: "adaugat" },
  },
};

function linie(extra: Partial<CartItem>): CartItem {
  return {
    productId: "p1", name: "Fototapet", price: 89, imageUrl: null, quantity: 1,
    ...extra,
  } as CartItem;
}

test("⚠ fototapetul se vede in cos cu pretul lui, nu cu cel de catalog", () => {
  /*
   * 350 x 250 cm = 8,75 m². Premium 89 lei/m² = 778,75; protectia 15 lei/m² = 131,25; total 910.
   * Pretul de catalog NU se aduna: `includePretulProdusului` e stins, deci nu se incaseaza deloc.
   */
  const item = linie({ customization: { dim: { latime: 350, inaltime: 250 }, mat: "prm", prot: true } });
  const l = pretulLiniei(item, FOTOTAPET);
  assert.equal(l.subtotal, 910, "cosul arata alt numar decat incaseaza serverul");
  assert.equal(l.unitPrice, 910);
  assert.equal(pretulBucatii(item, FOTOTAPET), 910, "eticheta „1 buc x P” ar minti");

  /*
   * ⚠ PERECHEA NEGATIVA, si fara ea proba n-ar insemna nimic: aceeasi linie FARA valori ramane la
   * pretul de catalog. Asa se vede ca cei 910 vin chiar din personalizare, nu dintr-un modul care
   * a inceput sa umfle orice linie.
   */
  assert.equal(pretulLiniei(linie({}), FOTOTAPET).subtotal, 89);
});

test("⚠ pretul de catalog se aduna doar cand se incaseaza", () => {
  const item = linie({ productId: "cana", name: "Cana", customization: { text: "Robert", cutie: true } });
  assert.equal(pretulLiniei(item, CANA).subtotal, 114, "89 de catalog + 25 cutia");

  /* Fara cutie ramane chiar catalogul: suplimentul e zero, dar baza se incaseaza. */
  const fara = linie({ productId: "cana", name: "Cana", customization: { text: "Maria" } });
  assert.equal(pretulLiniei(fara, CANA).subtotal, 89);
});

test("⚠ „N buc x P” ramane adevarat: unitar x cantitate = total + economie", () => {
  /*
   * Invariantul randului din cos. Fara personalizare in `pretulBucatii`, randul scria
   * „2 buc x 89 lei" langa un total de 1.820, si al treilea numar nu se lega de niciunul.
   */
  const item = linie({ quantity: 2, customization: { dim: { latime: 350, inaltime: 250 }, mat: "prm", prot: true } });
  const l = pretulLiniei(item, FOTOTAPET);
  const bucata = pretulBucatii(item, FOTOTAPET);
  assert.equal(l.subtotal, 1820);
  assert.equal(Math.round((bucata * 2 - (l.subtotal + l.savings)) * 100) / 100, 0);
});

test("⚠ treapta de cantitate se aplica pe BAZA, nu pe supliment", () => {
  /*
   * Cana la 89, pachet de 3 la 240 (adica 80 bucata), cu cutie cadou +25 pe bucata.
   * Serverul socoteste `(baza dupa trepte) + supliment` = 80 + 25 = 105 pe bucata, deci 315.
   * Adunat INAINTE de trepte, pachetul ar fi redus si cutia — 240 + ceva, alt numar decat incaseaza.
   */
  const cuTrepte: RegulaPretCos = {
    ...CANA,
    tiers: { enabled: true, mode: "price", tier3_price: 240 },
  };
  const item = linie({ productId: "cana", name: "Cana", quantity: 3, customization: { text: "Robert", cutie: true } });
  const l = pretulLiniei(item, cuTrepte);
  assert.equal(l.unitPrice, 105, "suplimentul a intrat sub treapta de cantitate");
  assert.equal(l.subtotal, 315);
});

test("⚠ fara preturi de la server linia ramane la ce s-a salvat, nu la zero", () => {
  /*
   * Cererea de preturi poate cadea. Atunci nu se poate socoti personalizarea — dar nici nu se
   * inventeaza un numar: se arata pretul salvat, exact ca inainte. Serverul refuza oricum ce nu se
   * potriveste, deci nu se poate cumpara pe pretul asta.
   */
  const item = linie({ price: 89, customization: { dim: { latime: 350, inaltime: 250 }, mat: "prm" } });
  assert.equal(pretulLiniei(item, undefined).subtotal, 89);
  assert.equal(pretulBucatii(item, undefined), 89);
});

test("⚠ un produs FARA personalizare pastreaza socoteala de dinainte, caracter cu caracter", () => {
  const simplu: RegulaPretCos = { price: 50, combos: { "S / Rosu": 60 }, tiers: null, customization: null };
  const item = linie({ productId: "t", name: "Tricou", price: 50, quantity: 3, variantTitle: "S / Rosu" });
  const l = pretulLiniei(item, simplu);
  assert.equal(l.subtotal, 180, "pretul combinatiei nu se mai citeste");
  assert.equal(l.unitPrice, 60);
  assert.equal(l.savings, 0);
});

test("⚠ serverul trimite chiar DEFINITIA personalizarii catre cos", () => {
  /*
   * Fara campul asta in `getCartPricing`, tot ce e mai sus ar fi trecut verde si cosul ar fi
   * afisat mai departe pretul de catalog: modulul e corect, dar n-ar avea din ce socoti.
   *
   * ⚠ Felia se ia intre doua jaloane care NU sunt ce se cauta — semnatura functiei si `return out`
   * — ca un mutant care sterge chiar randul cautat sa nu ramana fara felie si sa treaca verde.
   */
  const sursa = readFileSync(
    path.join(process.cwd(), "src/lib/actions/store.actions.ts"), "utf8",
  );
  const de = sursa.indexOf("export async function getCartPricing(");
  assert.notEqual(de, -1, "nu s-a gasit `getCartPricing`");
  const pana = sursa.indexOf("return out;", de);
  assert.notEqual(pana, -1, "nu s-a gasit sfarsitul lui `getCartPricing`");
  const felie = sursa.slice(de, pana);
  assert.match(felie, /customization:/, "definitia personalizarii nu mai pleaca spre cos");
});
