import assert from "node:assert/strict";
import { test } from "node:test";
import { articolelePentruProdus, type ContextArticole, type ProdusPepita } from "./articole";
import { caleaCategoriilor } from "./categorii";
import { produsXml } from "./serializare";
import { sablonMesajPepita } from "./activare";
import { CONFIG_IMPLICIT } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   O PROMISIUNE FACUTA LOR, SI CODUL CARE TREBUIE SA O TINA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE APARA PROBA ASTA, si de ce nu se poate altfel.

   La activare le scriem, in scris: „Feedul NU conține produse cu variații: fiecare variantă
   este trimisă ca produs de sine stătător, cu identificator propriu." Pe baza acestei
   propozitii ei raspund la intrebarea din Seller Center si isi configureaza importul.

   Cele doua capete traiau despartite: textul in `activare.ts`, serializatorul in
   `serializare.ts`. O reparatie viitoare care ar incepe sa emita `<Variations>` ar fi trecut de
   toate probele, si prima care ar fi aflat ar fi fost Pepita, dupa ce importul lor s-ar fi
   purtat altfel decat le-am spus.

   ⚠ SI NU E O ALEGERE CARE SE POATE LUA DE DOUA ORI. Documentatia lor, in paragraful despre
   `<Variations>`: „Ha egy termék egyszer variációsként lett átadva, azon változtatni nem
   szabad" — un produs predat o data ca variational nu mai are voie sa fie schimbat. Copia e in
   `docs/pepita/xml-format-2026-09-08.txt`. De aceea trecerea la modul nativ nu e o reparatie,
   ci o hotarare separata, luata dupa un raspuns de la ei.
*/

const CTX: ContextArticole = {
  business: { slug: "magazin", custom_domain: null, store_name: "Magazin", business_name: "SRL" },
  config: { ...CONFIG_IMPLICIT, activ: true },
  magazin: { vat_enabled: true, vat_rate: 21, prices_include_vat: true },
  caleCategorie: caleaCategoriilor([{ id: "c1", name: "Tricouri", parent_id: null }]),
  baza: "https://magazin.ro",
};

const PRODUS_CU_VARIANTE: ProdusPepita = {
  id: "7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
  name: "Tricou",
  slug: "tricou",
  description: "Un tricou.",
  price: 99.99,
  compare_at_price: null,
  sku: "TRICOU",
  images: ["https://cdn.ro/a.jpg"],
  category: "Tricouri",
  track_inventory: true,
  stock_quantity: 10,
  weight_grams: 200,
  is_bundle: false,
  updated_at: "2026-09-01T10:00:00.000Z",
  page_sections: {
    variants: {
      enabled: true,
      options: [
        { id: "o1", name: "Mărime", values: ["S", "M"] },
        { id: "o2", name: "Culoare", values: ["Roșu"] },
      ],
      combinations: [
        { id: "a", title: "S / Roșu", price: "", compare_at_price: "", sku: "", stock_quantity: "3", image: "", enabled: true },
        { id: "b", title: "M / Roșu", price: "", compare_at_price: "", sku: "", stock_quantity: "4", image: "", enabled: true },
      ],
    },
  },
};

test("⚠ un produs cu variante pleaca APLATIZAT: niciun element de variatie in XML", () => {
  const { articole } = articolelePentruProdus(PRODUS_CU_VARIANTE, CTX);
  assert.equal(articole.length, 2, "cele doua combinatii nu au dat doua articole");

  const xml = articole.map(produsXml).join("");
  for (const interzis of ["<Variations", "<Variation>", "<PrimaryAttribute", "<SecondaryAttribute", "<TertiaryAttribute", "<PrimaryVariation"]) {
    assert.ok(!xml.includes(interzis), `feedul a inceput sa emita ${interzis}, iar lor le-am promis ca nu`);
  }

  /*
   * Fiecare combinatie are identificatorul EI: asta e chiar promisiunea „cu identificator
   * propriu". Nu se numara `<Id>`-urile din XML, fiindca elementul apare si in categorii si in
   * poze: se ia identitatea articolului si se cauta in text.
   */
  assert.notEqual(articole[0].id, articole[1].id, "doua combinatii nu pot pleca cu acelasi identificator");
  for (const a of articole) assert.ok(xml.includes(`<Id>${a.id}</Id>`), `identificatorul ${a.id} nu e in XML`);
});

test("⚠ si promisiunea scrisa lor spune exact asta", () => {
  const m = sablonMesajPepita({
    feedProduse: "https://www.edinio.com/api/pepita/produse/K.xml",
    feedStoc: "https://www.edinio.com/api/pepita/stoc/K.xml",
    comenzi: "https://www.edinio.com/api/pepita/comenzi/K2",
  });
  assert.match(m, /NU conține produse cu variații/);
});

test("⚠ atributele combinatiei PLEACA totusi, ca `<Attributes>`", () => {
  /*
   * Aplatizarea nu pierde axele: „Mărime: S" si „Culoare: Roșu" ajung la ei ca atribute ale
   * articolului. Fara randurile astea, un cititor grabit ar putea crede ca aplatizarea arunca
   * informatia despre variantă, si ar „repara" ceva ce nu e stricat.
   */
  const { articole } = articolelePentruProdus(PRODUS_CU_VARIANTE, CTX);
  const xml = produsXml(articole[0]);
  assert.match(xml, /<Attributes>/);
  assert.match(xml, /<AttributeName>Mărime<\/AttributeName>/);
  assert.match(xml, /<AttributeValue>S<\/AttributeValue>/);
});
