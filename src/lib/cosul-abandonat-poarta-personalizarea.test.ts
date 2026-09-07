import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { liniiRecuperabile, type AbandonedCartItem, type ProdusCosSalvat } from "./abandoned-cart";

/**
 * COSUL ABANDONAT POARTA ACUM VARIANTA SI PERSONALIZAREA.
 *
 * ═══ ⚠ CE PIERDEA EDINIO ═══
 *
 * Instantaneul avea cinci campuri, iar cele doua cai care il scriu il compuneau cu un `.map()` care
 * arunca `variantTitle` si `customization`. Deci `liniiRecuperabile` SAREA peste orice produs cu
 * variante sau cu personalizare — si sarirea era raspunsul corect atunci: o linie refacuta fara
 * marime sau fara gravura ar fi intrat in cos necomandabila, iar `restoreCart` SUPRASCRIE cosul.
 *
 * Urmarea: recuperarea nu functiona deloc tocmai pentru produsele personalizate, adica cele mai
 * scumpe si cele la care clientul a muncit cel mai mult.
 */

const FOTOTAPET: ProdusCosSalvat = {
  id: "p1",
  name: "Fototapet Padure",
  price: 89,
  images: ["https://exemplu/poza.webp"],
  is_active: true,
  page_sections: {
    customization: {
      enabled: true,
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 89, includePretulProdusului: false, minimM2: 1 },
      fields: [{
        id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 },
      }],
    },
  },
};

const SIMPLU: ProdusCosSalvat = {
  id: "p2", name: "Pahar", price: 20, images: [], is_active: true,
  page_sections: { variants: { enabled: false, options: [] } },
};

const catalog = (...p: ProdusCosSalvat[]) => new Map(p.map((x) => [x.id, x]));

const linie = (over: Partial<AbandonedCartItem>): AbandonedCartItem => ({
  product_id: "p1", name: "Fototapet Padure", price: 89, quantity: 1, ...over,
});

test("⚠ o linie personalizata NU mai dispare din recuperare", () => {
  /* ⚠ ASTA E REPARATIA, si e singura afirmatie de aici care ar fi fost rosie ieri. */
  const r = liniiRecuperabile(
    [linie({ customization: { dim: { latime: 350, inaltime: 250 } } })],
    catalog(FOTOTAPET),
  );
  assert.equal(r.length, 1, "linia personalizata e inca sarita: recuperarea nu merge pentru ea");
});

test("⚠ si valorile se duc mai departe, altfel s-ar reface o cana GOALA", () => {
  /*
   * Identitatea unei linii numara personalizarea (`lineKey`). Refacuta fara ea, n-ar fi nici macar
   * aceeasi linie — si omul ar fi primit in cos un fototapet fara dimensiuni.
   */
  const r = liniiRecuperabile(
    [linie({ customization: { dim: { latime: 350, inaltime: 250 } } })],
    catalog(FOTOTAPET),
  );
  assert.deepEqual(r[0].customization, { dim: { latime: 350, inaltime: 250 } });
});

test("⚠ pretul din email include SUPLIMENTUL, nu doar catalogul", () => {
  /*
   * ⚠ CIFRA CARE CONTEAZA: 350 × 250 cm = 8,75 m² × 89 lei/m² = 778,75, cu catalogul NEINCLUS.
   *
   * Fara asta, emailul de recuperare ar fi promis 89 de lei pentru un fototapet de 778,75 — exact
   * felul de minciuna pe care regula asta exista ca s-o opreasca. Masurat cand s-a scris:
   * 33 din 129 de linii salvate tineau alt pret decat catalogul, si doua emailuri plecasera deja.
   */
  const r = liniiRecuperabile(
    [linie({ customization: { dim: { latime: 350, inaltime: 250 } } })],
    catalog(FOTOTAPET),
  );
  assert.equal(r[0].price, 778.75, "emailul promite pretul de catalog pentru un produs personalizat");
});

test("⚠ o linie care CERE personalizare si n-are valori se sare in continuare", () => {
  /*
   * ⚠ PERECHEA CARE APARA CLIENTUL. Randurile salvate INAINTE de 07.09.2026 n-au campul deloc.
   * Refacute, ar fi intrat in cos necomandabile — iar `restoreCart` suprascrie cosul, deci omul ar
   * fi ramas cu o comanda pe care n-o poate trimite.
   */
  assert.deepEqual(liniiRecuperabile([linie({})], catalog(FOTOTAPET)), []);
});

test("⚠ definitia schimbata NU face linia sa dispara — se reface si se marcheaza", () => {
  /*
   * ⚠ HOTARARE, nu scapare. Daca marginile s-au stramtat dupa ce clientul a pus produsul in cos,
   * linia se reface si cosul o arata cu „Necesita actualizare" (`cereRevizuire`), iar omul o poate
   * repara. Sarita, ar fi disparut fara nicio explicatie dintr-un email trimis chiar de noi.
   *
   * ⚠ Si pretul cade pe CATALOG, nu pe unul socotit din valori care nu se mai potrivesc: un numar
   * vechi, dar nu unul inventat.
   */
  const stramtat: ProdusCosSalvat = {
    ...FOTOTAPET,
    page_sections: {
      customization: {
        enabled: true,
        pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 89, includePretulProdusului: false, minimM2: 1 },
        fields: [{
          id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 100, max: 200 }, inaltime: { min: 70, max: 200 },
        }],
      },
    },
  };
  const r = liniiRecuperabile(
    [linie({ customization: { dim: { latime: 350, inaltime: 250 } } })],
    catalog(stramtat),
  );
  assert.equal(r.length, 1, "linia a disparut in loc sa fie marcata");
  assert.equal(r[0].price, 89, "s-a socotit un pret din valori care nu se mai potrivesc");
});

test("⚠ produsele simple se poarta exact ca pana acum", () => {
  /*
   * Perechea obligatorie: fara ea, „nimic nu se mai sare" ar fi trecut si peste o reparatie care
   * strica recuperarea obisnuita — cea care merge de luni de zile.
   */
  const r = liniiRecuperabile(
    [{ product_id: "p2", name: "Pahar", price: 20, quantity: 2 }],
    catalog(SIMPLU),
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].price, 20);
  assert.equal(r[0].customization, undefined, "s-a inventat o personalizare pe un produs simplu");
});

test("⚠ cele TREI cai care scriu si refac linia poarta campurile", () => {
  /*
   * ⚠ O LISTA DE LOCURI E O MOSTRA. Instantaneul se scrie din doua locuri (finalizarea si
   * formularul de comanda directa) si se reface intr-unul (linkul din email). Reparat doar unul,
   * jumatate din cosuri ar fi ramas fara campuri — si nimic n-ar fi aratat care jumatate.
   */
  const sursa = (r: string) =>
    readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

  for (const [f, ce] of [
    ["src/components/storefront/sections/checkout/checkout-core.ts", "finalizarea"],
    ["src/components/ministore/OrderModal.tsx", "comanda directa"],
  ] as const) {
    assert.ok(sursa(f).includes("customization: i.customization")
      || sursa(f).includes("customization: customizationPayload"),
    `${ce} nu salveaza personalizarea in cosul abandonat`);
  }
  const refacere = sursa("src/components/ministore/MiniStoreRenderer.tsx");
  assert.ok(refacere.includes("customization: i.customization"), "restaurarea nu pune personalizarea inapoi");
  assert.ok(refacere.includes("variantTitle: i.variant_title"), "restaurarea nu pune varianta inapoi");
});
