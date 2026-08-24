import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  contextDinCategorii, grupeazaFamilii, idExtern, imaginiDeImportat, pretDeAfisat,
  produseDeCreat, stocDeImportat, titluCombinatie,
} from "./import-produse";
import { pretFaraTva } from "./mapping";
import type { EmagCategorie, EmagOfertaCitita } from "./types";

/*
 * Probele conversiei „oferta eMAG -> produs Edinio".
 *
 * Saltul de model e cel mai mare din toata integrarea: ei n-au variante, noi avem.
 * Fiecare proba de aici pazeste un fel in care saltul poate iesi gresit fara sa dea
 * vreo eroare.
 */

function of(x: Partial<EmagOfertaCitita> & { id: number }): EmagOfertaCitita {
  return { name: `Produs ${x.id}`, status: 1, sale_price: 100, ...x };
}

const CATEGORII: EmagCategorie[] = [{
  id: 506,
  name: "Tricouri",
  characteristics: [{ id: 6553, name: "Mărime" }, { id: 6554, name: "Culoare" }],
  family_types: [{ id: 95, name: "Tricou", characteristics: [{ characteristic_id: 6553 }] }],
}];
const CTX = contextDinCategorii(CATEGORII);
const PRET_CU_TVA = { vat_rate: 21, prices_include_vat: true };

/* ── Pretul, dus si intors ─────────────────────────────────────────────────── */

test("eMAG import: pretul dus fara TVA si adus inapoi da acelasi pret", () => {
  /*
   * ⚠ eMAG da toate preturile FARA TVA. Luat de-a gata, un catalog importat ar fi
   * aparut in magazin mai ieftin cu o cota intreaga — la 21%, o cincime sub pret.
   * Nu da nicio eroare: produsele se publica, se vand, si se afla din marja peste
   * o luna. De aceea proba merge in amandoua sensurile, nu doar intr-unul.
   */
  for (const p of [9.99, 49.5, 99.99, 123.45, 1999, 7.7]) {
    const dus = pretFaraTva(p, 21, true);
    assert.equal(pretDeAfisat(dus, 21, true), p, `dus-intors pentru ${p}`);
  }
});

test("eMAG import: la un magazin care tine preturile fara TVA, pretul nu se atinge", () => {
  assert.equal(pretDeAfisat(82.6364, 21, false), 82.64);
});

test("eMAG import: pretul afisat se rotunjeste la doua zecimale, nu la patru", () => {
  /* Spre eMAG se trimit patru, ca sa nu se piarda nimic la impartire. Dar
     `products.price` e pretul de pe eticheta, si nimeni nu vinde cu 82,6364 lei. */
  assert.equal(pretDeAfisat(82.6364, 21, true), 99.99);
});

/* ── Familiile ─────────────────────────────────────────────────────────────── */

test("eMAG import: `family.id === 0` NU e o familie", () => {
  /*
   * Asa scoate eMAG un produs dintr-o familie. Bagate toate intr-un cos comun sub
   * cheia 0, toate produsele simple ale unui magazin ar fi devenit UN produs cu
   * 300 de combinatii.
   */
  const f = grupeazaFamilii([
    of({ id: 1, family: { id: 0 } }),
    of({ id: 2, family: { id: 0 } }),
    of({ id: 3 }),
  ]);
  assert.equal(f.length, 3);
  assert.ok(f.every((x) => x.membri.length === 1));
});

test("eMAG import: membrii unei familii stau impreuna, in ordinea `emag_id`", () => {
  const f = grupeazaFamilii([
    of({ id: 9, family: { id: 44, family_type_id: 95 } }),
    of({ id: 3, family: { id: 44, family_type_id: 95 } }),
    of({ id: 7, family: { id: 44, family_type_id: 95 } }),
  ]);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].membri.map((m) => m.id), [3, 7, 9]);
});

/* ── Titlul combinatiei ────────────────────────────────────────────────────── */

test("eMAG import: titlul combinatiei vine din caracteristica ce desparte familia", () => {
  const t = titluCombinatie(
    of({ id: 1, characteristics: [{ id: 6554, value: "Roșu" }, { id: 6553, value: "M" }] }),
    [6553],
  );
  assert.equal(t, "M", "numai caracteristica de familie, nu si celelalte");
});

test("eMAG import: doua caracteristici de familie se lipesc cu separatorul casei", () => {
  const t = titluCombinatie(
    of({ id: 1, characteristics: [{ id: 6553, value: "M" }, { id: 6554, value: "Roșu" }] }),
    [6553, 6554],
  );
  assert.equal(t, "M / Roșu");
});

test("eMAG import: fara caracteristica, titlul cade pe `part_number`, NU pe un numar de ordine", () => {
  /*
   * ⚠ Un numar de ordine s-ar fi SCHIMBAT cand comerciantul mai adauga o marime.
   * Iar `emag_offers.variant_title` e chiar legatura pe care se scade stocul la o
   * vanzare: mutata sub picioare, vanzarea unei marimi ar fi scazut stocul alteia.
   */
  assert.equal(titluCombinatie(of({ id: 5, part_number: "TR-S" }), [6553]), "TR-S");
  assert.equal(titluCombinatie(of({ id: 5 }), [6553]), "#5", "ultima plasa: id-ul, tot stabil");
});

/* ── Imagini si stoc ───────────────────────────────────────────────────────── */

test("eMAG import: imaginea principala trece prima", () => {
  /* Lasate cum vin, produsul ar fi aparut in magazin cu alta poza decat pe eMAG,
     iar comerciantul ar fi crezut ca importul i-a stricat pozele. */
  const im = imaginiDeImportat([
    { url: "https://x/2.jpg", display_type: 2 },
    { url: "https://x/1.jpg", display_type: 1 },
  ]);
  assert.deepEqual(im.map((i) => i.src), ["https://x/1.jpg", "https://x/2.jpg"]);
  assert.deepEqual(im.map((i) => i.position), [0, 1]);
});

test("eMAG import: stocul se ADUNA pe depozite", () => {
  /* Luata doar prima intrare, un comerciant cu doua depozite si-ar fi vazut in
     Edinio jumatate din marfa, iar magazinul ar fi spus „stoc epuizat". */
  assert.equal(stocDeImportat(of({ id: 1, stock: [{ warehouse_id: 1, value: 4 }, { warehouse_id: 2, value: 6 }] })), 10);
});

test("eMAG import: fara depozite se cade pe `general_stock`", () => {
  assert.equal(stocDeImportat(of({ id: 1, stock: [], general_stock: 3 })), 3);
  assert.equal(stocDeImportat(of({ id: 1 })), 0);
});

/* ── Familia devine UN produs ──────────────────────────────────────────────── */

test("eMAG import: un tricou in trei marimi da UN produs cu trei combinatii", () => {
  /*
   * ═══ PROBA CENTRALA A FISIERULUI ═══
   *
   * Mers oferta cu oferta, comerciantul si-ar fi vazut in Edinio TREI produse cu
   * acelasi nume, aceeasi poza si stocul rupt in trei — si n-ar fi raportat asta ca
   * pe un defect, ci ar fi crezut ca asa merge platforma.
   */
  const familii = grupeazaFamilii([
    of({ id: 11, name: "Tricou bumbac", category_id: 506, sale_price: 82.6364, family: { id: 44, family_type_id: 95 },
         characteristics: [{ id: 6553, value: "S" }], stock: [{ warehouse_id: 1, value: 2 }], part_number: "TR-S" }),
    of({ id: 12, name: "Tricou bumbac", category_id: 506, sale_price: 90, family: { id: 44, family_type_id: 95 },
         characteristics: [{ id: 6553, value: "M" }], stock: [{ warehouse_id: 1, value: 5 }], part_number: "TR-M" }),
    of({ id: 13, name: "Tricou bumbac", category_id: 506, sale_price: 90, family: { id: 44, family_type_id: 95 },
         characteristics: [{ id: 6553, value: "L" }], stock: [{ warehouse_id: 1, value: 0 }], part_number: "TR-L" }),
  ]);
  const { produse, probleme, compozitie } = produseDeCreat(familii, CTX, PRET_CU_TVA);

  assert.equal(probleme.length, 0);
  assert.equal(produse.length, 1, "UN produs, nu trei");
  const p = produse[0];
  assert.equal(p.variants?.combinations.length, 3);
  assert.deepEqual(p.variants?.combinations.map((c) => c.title), ["S", "M", "L"]);
  assert.equal(p.variants?.options[0].name, "Mărime", "axa isi ia numele din categorie");
  assert.deepEqual(p.variants?.options[0].values, ["S", "M", "L"]);
  assert.deepEqual(p.category_path, ["Tricouri"]);

  /* Fiecare marime pleaca cu STOCUL EI, iar produsul cu totalul. */
  assert.deepEqual(p.variants?.combinations.map((c) => c.stock_quantity), [2, 5, 0]);
  assert.equal(p.stock_quantity, 7);

  /* Pretul produsului e CEL MAI MIC, ca sa scrie „de la" corect. */
  assert.equal(p.price, 99.99);

  /* Compozitia leaga fiecare `emag_id` de titlul combinatiei lui — din ea se scriu
     randurile `emag_offers`, adica insasi legatura pe care se scade stocul. */
  assert.deepEqual(compozitie.get(idExtern(familii[0])), [
    { emag_id: 11, variant_title: "S" },
    { emag_id: 12, variant_title: "M" },
    { emag_id: 13, variant_title: "L" },
  ]);
});

test("eMAG import: familia fara tip de familie NU primeste o axa inventata", () => {
  /*
   * Fara caracteristicile care despart familia nu stim CE le deosebeste, doar ca
   * sunt deosebite. Un produs cu combinatiile „TR-S", „TR-M" ar fi aratat
   * cumparatorului niste coduri drept marimi. Mai bine se spune limpede.
   */
  const familii = grupeazaFamilii([
    of({ id: 21, family: { id: 77, family_type_id: 999 }, part_number: "TR-S" }),
    of({ id: 22, family: { id: 77, family_type_id: 999 }, part_number: "TR-M" }),
  ]);
  const { produse, probleme } = produseDeCreat(familii, CTX, PRET_CU_TVA);
  assert.equal(produse.length, 0);
  assert.equal(probleme.length, 1);
  assert.match(probleme[0], /nu se știe ce deosebește/);
});

test("eMAG import: doua combinatii cu acelasi titlu — prima castiga, a doua se raporteaza", () => {
  /*
   * ⚠ In datele reale exista 31 de titluri duplicate pe 7 produse. Doua combinatii
   * cu acelasi titlu inseamna doua randuri `emag_offers` cu aceeasi cheie
   * `(business_id, product_id, variant_title)` — scrierea cade, si cade pentru tot
   * produsul, nu pentru randul acela.
   */
  const familii = grupeazaFamilii([
    of({ id: 31, family: { id: 88, family_type_id: 95 }, characteristics: [{ id: 6553, value: "M" }] }),
    of({ id: 32, family: { id: 88, family_type_id: 95 }, characteristics: [{ id: 6553, value: "M" }] }),
  ]);
  const { produse, probleme, compozitie } = produseDeCreat(familii, CTX, PRET_CU_TVA);
  assert.equal(produse.length, 1);
  assert.equal(produse[0].variants?.combinations.length, 1);
  assert.equal(compozitie.get(idExtern(familii[0]))!.length, 1, "numai oferta 31 primeste rand");
  assert.match(probleme[0], /aceeași denumire de variantă/);
});

/* ── Produsul simplu ───────────────────────────────────────────────────────── */

test("eMAG import: o oferta fara familie da un produs simplu, fara variante", () => {
  const familii = grupeazaFamilii([
    of({ id: 41, name: "Cană", category_id: 506, sale_price: 41.3223, part_number: "CANA 1",
         ean: ["5941234567890"], brand: "Marca", stock: [{ warehouse_id: 1, value: 12 }] }),
  ]);
  const { produse } = produseDeCreat(familii, CTX, PRET_CU_TVA);
  assert.equal(produse.length, 1);
  const p = produse[0];
  assert.equal(p.variants, null);
  assert.equal(p.name, "Cană");
  assert.equal(p.price, 50);
  assert.equal(p.sku, "CANA1", "SKU-ul se normalizeaza ca la ei");
  assert.equal(p.gtin, "5941234567890");
  assert.equal(p.brand, "Marca");
  assert.equal(p.stock_quantity, 12);
  assert.equal(p.external_id, "oferta-41");
});

test("eMAG import: un produs inactiv la eMAG intra inactiv, nu lipseste", () => {
  const familii = grupeazaFamilii([of({ id: 42, status: 0 })]);
  const { produse } = produseDeCreat(familii, CTX, PRET_CU_TVA);
  assert.equal(produse.length, 1);
  assert.equal(produse[0].is_active, false);
});

/* ── Cheia de dedublare ────────────────────────────────────────────────────── */

test("eMAG import: familia 12 si oferta 12 NU se ciocnesc in `external_id`", () => {
  /*
   * Cheia de dedublare e `products_source_external_uidx (business_id, source,
   * external_id)`. Amandoua sunt numere din contul aceluiasi comerciant si se pot
   * ciocni: fara prefix, al doilea import ar fi „actualizat" produsul gresit in loc
   * sa-l creeze pe al lui.
   */
  const familie = grupeazaFamilii([of({ id: 99, family: { id: 12, family_type_id: 95 } })])[0];
  const singura = grupeazaFamilii([of({ id: 12 })])[0];
  assert.notEqual(idExtern(familie), idExtern(singura));
  assert.equal(idExtern(familie), "familie-12");
  assert.equal(idExtern(singura), "oferta-12");
});

/* ── Categoria ─────────────────────────────────────────────────────────────── */

test("eMAG import: o categorie necunoscuta lasa produsul FARA categorie", () => {
  /*
   * Alternativa ar fi fost „Categoria 1234", si atunci `upsertCategoryPath` ar fi
   * facut in magazin cate o categorie cu numar pentru fiecare categorie eMAG
   * neadusa — gunoi vizibil in meniul magazinului, curatat apoi de mana.
   */
  const familii = grupeazaFamilii([of({ id: 51, category_id: 99999 })]);
  const { produse } = produseDeCreat(familii, CTX, PRET_CU_TVA);
  assert.deepEqual(produse[0].category_path, []);
});

test("eMAG import: o oferta fara nume nu devine produs, si se spune de ce", () => {
  const familii = grupeazaFamilii([of({ id: 61, name: "  " })]);
  const { produse, probleme } = produseDeCreat(familii, CTX, PRET_CU_TVA);
  assert.equal(produse.length, 0);
  assert.match(probleme[0], /nu are nume/);
});

test("eMAG: reconcilierea foloseste ACEEASI socoteala de stoc ca importul", () => {
  /*
   * ═══ DOUA COPII ALE ACELEIASI CUNOASTERI, UNA GRESITA ═══
   *
   * `scrieStatusurile` din cron aduna doar `o.stock[]`. Dar raspunsul lui
   * `product_offer/read` nu e in schema lor, iar ofertele vin adesea fara `stock[]`
   * si cu `general_stock` — chiar ce vede cumparatorul la ei.
   *
   * Masurat pe un catalog de 3.754 de oferte: cu stocul citit ca zero, doar 27 ieseau
   * „Se vinde pe eMAG", desi 3.469 erau aprobate la ei. Celelalte apareau „Trimis, in
   * validare" — o eticheta care il trimite pe om sa astepte ceva incheiat de mult.
   *
   * ⚠ Proba se uita la SURSA cronului, nu la comportament: cele doua socoteli dau
   * amandoua un numar, deci despartirea lor nu se vede din afara.
   */
  /* ⚠ Reconcilierea s-a mutat din ruta de cron in `statusuri.ts`, ca s-o poata chema si
     notificarea „documentatie aprobata" — scrisa a doua oara acolo, s-ar fi departat de
     asta, iar despartirea nu s-ar fi vazut. Proba citeste amandoua fisierele: forma
     veche, care se uita numai la ruta, ar fi trecut verde peste o reconciliere mutata si
     stricata. */
  const sursa = readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8")
    + readFileSync("src/lib/emag/statusuri.ts", "utf8");
  assert.equal(
    sursa.includes("const stoc = stocDeImportat(o)"), true,
    "reconcilierea nu mai cheama `stocDeImportat`",
  );
  /* ⚠ Se cauta ORICE adunare proprie peste `stock`, nu doar forma exacta de dinainte:
     prima cautare a ratat-o pe a doua, din masurarea derivei, care era mai periculoasa
     — acolo diferenta nu doar se ARATA, ci se si REPARA, cu scrieri catre eMAG. */
  const adunariProprii = sursa
    .split(String.fromCharCode(10))
    .filter((l: string) => l.includes(".stock") && l.includes(".reduce("));
  assert.deepEqual(
    adunariProprii, [],
    "adunare proprie peste `stock`, care nu stie de `general_stock`",
  );
});
