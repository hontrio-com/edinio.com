import assert from "node:assert/strict";
import { test } from "node:test";
import { lineKey, normalizeazaCos } from "./normalize";

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

/* -- Configuratorul in cos ------------------------------------------------- */

test("cosurile de ACUM raman neatinse: fara configuratie, cheia e cea veche", () => {
  /*
   * ⚠ Cerinta cea mai grea a intregii schimbari. Daca cheia unei linii fara configuratie s-ar
   * schimba, fiecare cos aflat acum in localStorage-ul unui cumparator s-ar desface in linii noi
   * la prima incarcare a paginii — si nimeni n-ar afla de ce.
   */
  assert.equal(lineKey({ productId: "p1" }), "p1");
  assert.equal(lineKey({ productId: "p1", variantTitle: "S / Rosu" }), "p1::S / Rosu");
});

test("doua configuratii diferite sunt DOUA linii", () => {
  const cos = normalizeazaCos([
    { productId: "p1", name: "Cana", price: 50, quantity: 1, configuratie: { g: { f: "text", v: "Robert" } } },
    { productId: "p1", name: "Cana", price: 50, quantity: 1, configuratie: { g: { f: "text", v: "Maria" } } },
  ]);
  assert.equal(cos.length, 2, "contopite, a doua gravura ar fi disparut inainte de a fi vazuta");
  assert.notEqual(cos[0].amprenta, cos[1].amprenta);
});

test("aceeasi configuratie adaugata de doua ori CRESTE cantitatea", () => {
  const cos = normalizeazaCos([
    { productId: "p1", name: "Cana", price: 50, quantity: 1, configuratie: { g: { f: "text", v: "Robert" } } },
    { productId: "p1", name: "Cana", price: 50, quantity: 2, configuratie: { g: { f: "text", v: "Robert" } } },
  ]);
  assert.equal(cos.length, 1);
  assert.equal(cos[0].quantity, 3);
});

test("AMPRENTA SCRISA DE MANA nu hotaraste nimic: se recalculeaza", () => {
  /*
   * ⚠ localStorage e text pe care il poate scrie oricine. Crezuta pe cuvant, o amprenta pusa la
   * fel pe doua configuratii diferite le-ar fi contopit intr-o singura linie.
   */
  const cos = normalizeazaCos([
    { productId: "p1", name: "Cana", price: 50, quantity: 1, amprenta: "aceeasi", configuratie: { g: { f: "text", v: "Robert" } } },
    { productId: "p1", name: "Cana", price: 50, quantity: 1, amprenta: "aceeasi", configuratie: { g: { f: "text", v: "Maria" } } },
  ]);
  assert.equal(cos.length, 2);
  assert.ok(!cos.some((l) => l.amprenta === "aceeasi"));
});

test("o configuratie GOALA nu schimba cheia liniei", () => {
  // Altfel o linie fara configurator ar fi primit deodata alta cheie decat avea in cosul salvat.
  for (const goala of [undefined, null, {}, "gunoi", 5, []]) {
    const cos = normalizeazaCos([{ productId: "p1", name: "Cana", price: 50, quantity: 1, configuratie: goala }]);
    assert.equal(cos[0].amprenta, undefined, `configuratia ${JSON.stringify(goala)} n-ar trebui sa lase amprenta`);
    assert.equal(cos[0].configuratie, undefined);
    assert.equal(lineKey(cos[0]), "p1");
  }
});

test("configuratia se CURATA, nu se ia asa cum vine", () => {
  const cos = normalizeazaCos([{
    productId: "p1", name: "Cana", price: 50, quantity: 1,
    configuratie: { g: { f: "text", v: "  Robert  " }, x: { f: "necunoscut" } },
  }]);
  assert.deepEqual(cos[0].configuratie, { g: { f: "text", v: "Robert" } });
});

test("varianta SI configuratia impreuna fac o cheie unica", () => {
  const cos = normalizeazaCos([
    { productId: "p1", name: "Cana", price: 50, quantity: 1, variantTitle: "S", configuratie: { g: { f: "text", v: "A" } } },
    { productId: "p1", name: "Cana", price: 50, quantity: 1, variantTitle: "M", configuratie: { g: { f: "text", v: "A" } } },
    { productId: "p1", name: "Cana", price: 50, quantity: 1, variantTitle: "S", configuratie: { g: { f: "text", v: "B" } } },
  ]);
  assert.equal(cos.length, 3);
});

test("REZUMATUL se curata: text pe care il poate scrie oricine", () => {
  /*
   * ⚠ React scapa continutul, deci nu e o poarta de injectie — dar un sir de zece mii de caractere
   * pus de mana ar fi rupt asezarea cosului, si o mie de randuri l-ar fi facut nefolosibil.
   */
  const cos = normalizeazaCos([{
    productId: "p1", name: "Cana", price: 50, quantity: 1,
    configuratie: { g: { f: "text", v: "Robert" } },
    rezumat: [
      { id: "g", eticheta: "Gravura", valoare: "Robert", scurt: true },
      { id: "x", eticheta: "L".repeat(5000), valoare: "V".repeat(5000), scurt: false },
      { eticheta: "fara valoare" },
      "gunoi",
      null,
      ...Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, eticheta: "E", valoare: "V" })),
    ],
  }]);
  const r = cos[0].rezumat!;
  assert.ok(r.length <= 50, `am pastrat ${r.length} randuri`);
  assert.equal(r[0].eticheta, "Gravura");
  assert.ok(r[1].eticheta.length <= 200 && r[1].valoare.length <= 200, "textele se taie");
  assert.ok(!r.some((x) => x.valoare === undefined), "randurile fara valoare se arunca");
});

test("rezumatul dispare odata cu configuratia", () => {
  // Altfel o linie fara configurator ar fi purtat un rezumat pe care nimic nu-l explica.
  const cos = normalizeazaCos([{
    productId: "p1", name: "Cana", price: 50, quantity: 1,
    rezumat: [{ id: "g", eticheta: "Gravura", valoare: "Robert", scurt: true }],
  }]);
  assert.equal(cos[0].rezumat, undefined);
});

test("rezumatul NU intra in identitatea liniei", () => {
  /*
   * ⚠ Identitatea se face din VALORI, nu din felul in care le scriem. Doua linii cu aceleasi
   * alegeri dar cu rezumate scrise altfel (o versiune noua a configuratorului a redenumit un
   * camp) trebuie sa ramana aceeasi linie.
   */
  const cos = normalizeazaCos([
    { productId: "p1", name: "Cana", price: 50, quantity: 1,
      configuratie: { g: { f: "text", v: "Robert" } },
      rezumat: [{ id: "g", eticheta: "Gravura", valoare: "Robert", scurt: true }] },
    { productId: "p1", name: "Cana", price: 50, quantity: 1,
      configuratie: { g: { f: "text", v: "Robert" } },
      rezumat: [{ id: "g", eticheta: "Text gravat", valoare: "Robert", scurt: true }] },
  ]);
  assert.equal(cos.length, 1, "aceeasi configuratie, deci aceeasi linie");
  assert.equal(cos[0].quantity, 2);
});
