import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeazaCos, lineKey } from "./normalize";

/**
 * Cosul se citea din localStorage cu `JSON.parse` intors direct in stare. Adica
 * text scris de oricine devenea stare de React fara nicio verificare.
 */

const linie = (over: Record<string, unknown> = {}) => ({
  productId: "p1", name: "Prosop", price: 19.99, imageUrl: null, quantity: 2, ...over,
});

test("un cos sanatos trece neatins", () => {
  assert.deepEqual(normalizeazaCos([linie()]), [linie()]);
});

test("JSON valid care NU e cos nu ajunge in stare", () => {
  // „null", „5" si „{}" trec de `JSON.parse` fara sa arunce, iar la randarea
  // urmatoare `items.map(...)` arunca — si nu o data, fiindca cheia se reciteste
  // la fiecare montare: magazinul ramane pagina de eroare.
  for (const rau of [null, 5, {}, "sir", true, undefined]) {
    assert.deepEqual(normalizeazaCos(rau), [], JSON.stringify(rau ?? null));
  }
});

test("liniile stricate se ARUNCA, nu se repara pe jumatate", () => {
  // Fara produs sau cu pret nenumeric, linia n-are ce cauta intr-o comanda.
  assert.deepEqual(normalizeazaCos([linie({ productId: "" }), linie({ productId: 7 }), null, "x"]), []);
  assert.deepEqual(normalizeazaCos([linie({ price: "abc" }), linie({ price: -1 })]), []);
  // `Number(null)`, `Number("")`, `Number([])` si `Number(false)` dau toate 0:
  // verificate cu `Number(...)`, liniile astea treceau cu un pret INVENTAT, iar
  // cosul socotea pragul de livrare gratuita pe zero lei.
  for (const rau of [null, "", "  ", [], false, true, undefined, {}]) {
    assert.deepEqual(normalizeazaCos([linie({ price: rau })]), [], JSON.stringify(rau ?? null));
  }
});

test("cantitatea se clemeaza pe fiecare linie", () => {
  assert.equal(normalizeazaCos([linie({ quantity: 0.5 })])[0].quantity, 1);
  assert.equal(normalizeazaCos([linie({ quantity: -4 })])[0].quantity, 1);
  assert.equal(normalizeazaCos([linie({ quantity: "3" })])[0].quantity, 3);
  assert.equal(normalizeazaCos([linie({ quantity: 1e9 })])[0].quantity, 999);
  assert.equal(normalizeazaCos([linie({ quantity: undefined })])[0].quantity, 1);
});

test("o linie buna nu e trasa in jos de una stricata de langa ea", () => {
  const r = normalizeazaCos([linie({ productId: "" }), linie({ productId: "p2", quantity: 0.5 })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].productId, "p2");
  assert.equal(r[0].quantity, 1);
});

test("doua linii care cad pe aceeasi cheie se PLIAZA, nu raman alaturi", () => {
  // Amandoua au `variantTitle` de alt tip, deci amandoua raman fara — si ajung pe
  // aceeasi `lineKey`. Lasate asa, `updateQty` ar scrie in amandoua, `removeItem`
  // le-ar sterge pe amandoua, iar bucatile s-ar numara de doua ori.
  const r = normalizeazaCos([linie({ variantTitle: 1, quantity: 2 }), linie({ variantTitle: 2, quantity: 4 })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].quantity, 6);
  // Doua marimi diferite raman insa doua linii.
  assert.equal(normalizeazaCos([linie({ variantTitle: "S" }), linie({ variantTitle: "L" })]).length, 2);
  // Plierea nu poate trece de plafon.
  assert.equal(normalizeazaCos([linie({ quantity: 900 }), linie({ quantity: 900 })])[0].quantity, 999);
});

test("campurile optionale supravietuiesc, cele de tip gresit nu", () => {
  const r = normalizeazaCos([linie({ variantTitle: "S", variantSku: "SKU-1", slug: "prosop" })])[0];
  assert.equal(r.variantTitle, "S");
  assert.equal(r.variantSku, "SKU-1");
  assert.equal(r.slug, "prosop");
  assert.equal(normalizeazaCos([linie({ variantTitle: 42 })])[0].variantTitle, undefined);
  assert.equal(normalizeazaCos([linie({ imageUrl: 42 })])[0].imageUrl, null);
});

test("pretul se pastreaza cu zecimalele lui: liniile de pachet sunt nerotunjite", () => {
  assert.equal(normalizeazaCos([linie({ price: 250 / 3 })])[0].price, 250 / 3);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ PERSONALIZAREA INTRA IN IDENTITATEA LINIEI
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ „Robert” si „Maria” sunt DOUA linii, chiar la acelasi pret", () => {
  /*
   * ⚠ CE COSTA CAND NU SUNT: a doua adaugare doar crestea cantitatea primeia, iar clientul
   * primea doua cani gravate cu acelasi nume. Si n-avea cum sa afle — cosul ii arata o singura
   * linie, cu cantitatea 2. Personalizarea nu e un detaliu al liniei; ea E linia.
   */
  const baza = { productId: "p1", name: "Cana", price: 41, imageUrl: null };
  const robert = { ...baza, customization: { nume: "Robert" } };
  const maria = { ...baza, customization: { nume: "Maria" } };

  assert.notEqual(lineKey(robert), lineKey(maria));
  assert.equal(lineKey(robert), lineKey({ ...baza, customization: { nume: "Robert" } }));
});

test("⚠ ordinea in care completeaza clientul campurile NU face doua linii", () => {
  /*
   * `JSON.stringify` pastreaza ordinea in care au fost puse cheile, iar ea difera intre doi
   * clienti care completeaza aceleasi campuri in alta ordine. Fara sortare, aceeasi personalizare
   * ar fi dat doua chei — deci doua linii identice in cos, una langa alta.
   */
  const a = { productId: "p1", name: "F", price: 89, imageUrl: null,
    customization: { dim: { latime: 350, inaltime: 250 }, mat: "prm" } };
  const b = { productId: "p1", name: "F", price: 89, imageUrl: null,
    customization: { mat: "prm", dim: { inaltime: 250, latime: 350 } } };
  assert.equal(lineKey(a), lineKey(b));
});

test("⚠ produsele FARA personalizare pastreaza cheia de dinainte, caracter cu caracter", () => {
  /*
   * ⚠ PERECHEA CARE APARA TOATE MAGAZINELE. Cosurile deja salvate in browserele oamenilor sunt
   * cheiate cu forma veche; o cheie schimbata le-ar fi pliat sau despartit gresit la prima
   * incarcare a paginii.
   */
  assert.equal(lineKey({ productId: "p1" }), "p1");
  assert.equal(lineKey({ productId: "p1", variantTitle: "S / Rosu" }), "p1::S / Rosu");
  /* Si un obiect GOL nu schimba nimic — o personalizare necompletata nu e o alta linie. */
  assert.equal(lineKey({ productId: "p1", customization: {} }), "p1");
});

test("⚠ personalizarea din localStorage trece prin aceleasi reguli ca restul", () => {
  /*
   * `localStorage` e scris de client. Ce n-are forma buna se SCOATE, nu se duce mai departe pe
   * jumatate: un tablou sau un sir pus acolo ar fi ajuns in `lineKey` si ar fi rupt identitatea.
   */
  const linie = (c: unknown) => normalizeazaCos([
    { productId: "p1", name: "C", price: 10, quantity: 1, customization: c },
  ])[0];

  assert.deepEqual(linie({ nume: "Robert" }).customization, { nume: "Robert" });
  assert.equal(linie("un sir").customization, undefined);
  assert.equal(linie(["un", "tablou"]).customization, undefined);
  assert.equal(linie(null).customization, undefined);

  /* ⚠ Si marimea se margineste: o personalizare uriasa ar fi umflat fiecare cheie de linie. */
  const uriasa: Record<string, string> = {};
  for (let i = 0; i < 500; i++) uriasa[`c${i}`] = "x".repeat(50);
  assert.equal(linie(uriasa).customization, undefined);
});

test("⚠ doua personalizari diferite NU se pliaza la normalizare", () => {
  /*
   * `normalizeazaCos` plieaza liniile cu aceeasi cheie, adunand cantitatile — corect pentru
   * variante scrise strambe. Cu personalizarea in cheie, doua gravuri diferite raman doua linii.
   */
  const cos = normalizeazaCos([
    { productId: "p1", name: "C", price: 41, quantity: 1, customization: { nume: "Robert" } },
    { productId: "p1", name: "C", price: 41, quantity: 1, customization: { nume: "Maria" } },
  ]);
  assert.equal(cos.length, 2);

  /* Perechea: aceeasi gravura CHIAR se pliaza, si cantitatile se aduna. */
  const acelasi = normalizeazaCos([
    { productId: "p1", name: "C", price: 41, quantity: 1, customization: { nume: "Robert" } },
    { productId: "p1", name: "C", price: 41, quantity: 2, customization: { nume: "Robert" } },
  ]);
  assert.equal(acelasi.length, 1);
  assert.equal(acelasi[0].quantity, 3);
});
