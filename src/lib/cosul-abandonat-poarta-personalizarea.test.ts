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

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUL VARIANTEI — al doilea numar pe care emailul il lua de unde nu trebuie
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un produs cu variante SI cu trepte de cantitate SI cu personalizare.
 *
 * ⚠ TOATE TREI PE ACELASI PRODUS, dinadins: fiecare in parte trecea, iar defectul era in ORDINEA
 * in care se aplica. Un produs cu o singura complicatie nu poate arata ca treapta s-a socotit din
 * pretul variantei, si nu din cel de catalog.
 */
const TRICOU: ProdusCosSalvat = {
  id: "p3",
  name: "Tricou",
  price: 100,
  images: [],
  is_active: true,
  page_sections: {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["M", "XL"] }],
      combinations: [
        { title: "M", price: "", enabled: true },
        { title: "XL", price: "150", enabled: true },
      ],
    },
    /* La 2 bucati, 10% reducere — se socoteste din pretul variantei. */
    quantity_tiers: { enabled: true, mode: "percent", tier2_percent: 10 },
  },
};

/**
 * Acelasi tricou, dar SI cu personalizare.
 *
 * ⚠ DOUA FIXTURI, NU UNA. Un produs care cere personalizare face `liniiRecuperabile` sa SARA
 * liniile fara valori — asa si trebuie —, deci pe el nu se poate masura pretul variantei SINGUR.
 * Cu doua fixturi, fiecare afirmatie masoara un lucru.
 */
const TRICOU_PERS: ProdusCosSalvat = {
  ...TRICOU,
  id: "p4",
  page_sections: {
    ...(TRICOU.page_sections as Record<string, unknown>),
    customization: {
      enabled: true,
      fields: [{
        id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [{ id: "prm", eticheta: "Premium", impact: { fel: "fix", suma: 30 } }],
      }],
    },
  },
};

test("⚠ emailul promite pretul VARIANTEI, nu al produsului", () => {
  /*
   * ═══ ⚠ CE MASURASE AUDITUL ═══
   *
   * Produs 100 lei, marimea XL 150 lei, linia salvata cu „XL". `pretEfectiv` pornea intotdeauna
   * de la `p.price` si nu se uita niciodata la `variant_title` — desi linia il pastreaza de pe
   * 07.09.2026. Emailul scria „XL — 100 lei", iar cosul o repretuia la 150 imediat ce omul apasa
   * linkul: promisiunea nu se tinea nici pana la prima pagina.
   */
  const r = liniiRecuperabile(
    [linie({ product_id: "p3", name: "Tricou", price: 100, variant_title: "XL" })],
    catalog(TRICOU),
  );
  assert.equal(r[0].price, 150, "emailul promite pretul de catalog pentru o varianta mai scumpa");

  /* Si varianta FARA pret propriu ramane pe cel de baza — „fara pret" nu inseamna „gratis". */
  const m = liniiRecuperabile(
    [linie({ product_id: "p3", name: "Tricou", price: 100, variant_title: "M" })],
    catalog(TRICOU),
  );
  assert.equal(m[0].price, 100);
});

test("⚠ treapta de cantitate se socoteste din pretul VARIANTEI", () => {
  /*
   * ⚠ AICI SE VEDE ORDINEA, si de-aia nu ajungea sa reparam doar prima linie. Cu treapta aplicata
   * peste catalog ar fi iesit 90; peste varianta iese 135. Un mutant care lasa `construiesteTrepte`
   * pe pretul de baza trece de proba de dinainte si cade aici.
   */
  const r = liniiRecuperabile(
    [linie({ product_id: "p3", name: "Tricou", price: 100, quantity: 2, variant_title: "XL" })],
    catalog(TRICOU),
  );
  assert.equal(r[0].price, 135, "treapta s-a socotit din alt pret decat cel al variantei");
});

test("⚠ varianta + personalizare: suplimentul se adauga PESTE pretul variantei", () => {
  /*
   * 150 (XL) + 30 (Premium) = 180. Cu pretul de catalog dedesubt ar fi iesit 130 — adica emailul
   * ar fi promis cu 50 de lei mai putin decat incaseaza serverul.
   */
  const r = liniiRecuperabile(
    [linie({ product_id: "p4", name: "Tricou", price: 100, variant_title: "XL", customization: { mat: "prm" } })],
    catalog(TRICOU_PERS),
  );
  assert.equal(r[0].price, 180, "suplimentul s-a adaugat peste pretul gresit");

  /*
   * ⚠ SI TOATE TREI DEODATA: 135 (XL cu treapta) + 30 = 165.
   *
   * ⚠ CIFRA ASTA E A COSULUI, nu una aleasa de mine. Prima varianta a probei cerea 162, adica
   * treapta aplicata peste (150 + 30). Gresit: `pretulLiniei` din cos aplica treapta pe pretul de
   * CATALOG al variantei si abia apoi adauga suplimentul. Emailul trebuie sa spuna ce spune cosul
   * la clic — daca ar socoti „mai corect" decat el, ar minti tot, doar in alta directie.
   */
  const tot = liniiRecuperabile(
    [linie({
      product_id: "p4", name: "Tricou", price: 100, quantity: 2,
      variant_title: "XL", customization: { mat: "prm" },
    })],
    catalog(TRICOU_PERS),
  );
  assert.equal(tot[0].price, 165, "ordinea varianta -> treapta -> personalizare nu e cea din cos");
});

test("⚠ o varianta STEARSA din catalog cade pe pretul de baza, nu pe unul inventat", () => {
  /*
   * Comerciantul sterge marimea dupa ce clientul a abandonat cosul. Un numar vechi e mai bun decat
   * unul inventat — iar cosul marcheaza linia „Necesita actualizare" la restaurare, deci omul afla.
   */
  const r = liniiRecuperabile(
    [linie({ product_id: "p3", name: "Tricou", price: 100, variant_title: "XXL" })],
    catalog(TRICOU),
  );
  assert.equal(r[0].price, 100);
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
