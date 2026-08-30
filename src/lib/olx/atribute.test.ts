import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rezolvaAtribut, rezolvaAtributele, legatoriDeAtribute, nuSePotriveste, nereguliAtribute,
} from "./atribute";
import type { MappableProduct } from "./mapping";
import type { OlxAttributeDef } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   DE UNDE VINE VALOAREA UNUI ATRIBUT (01.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Pana azi maparea era o CONSTANTA pe categorie:

       Categoria Edinio „Pantofi"  ->  OLX Brand = Nike

   Adica toti pantofii magazinului deveneau Nike. Brandul e al produsului, marimea e a variantei,
   iar „Stare: nou" chiar e o constanta.

   ⚠ SI MAPARILE VECHI RAMAN VALABILE. Un sir inseamna, ca pana acum, o constanta — deci nicio
   migratie de date si nicio zi in care maparea unui comerciant nu mai inseamna nimic.
*/

const PRODUS: MappableProduct = {
  id: "p1", name: "Pantofi sport Air", slug: "pantofi", description: "",
  price: 300, compare_at_price: null, images: [], category: "Pantofi",
  is_active: true, track_inventory: true, stock_quantity: 5,
  page_sections: {
    google: { brand: "Nike", gtin: "5901234123457" },
    sku: "PS-001",
    specifications: [
      { label: "Culoare", value: "Roșu" },
      { label: "Material", value: "Piele" },
    ],
    variants: {
      options: [
        { id: "o1", name: "Mărime", values: ["40", "41", "42"] },
        { id: "o2", name: "Culoare", values: ["Roșu"] },
      ],
    },
  },
};

test("⚠ maparile vechi inseamna in continuare o constanta", () => {
  /*
   * ⚠ AICI E COMPATIBILITATEA, si e cea mai importanta proba din fisier. Comerciantii au deja
   * mapari salvate ca siruri. Neintelese, fiecare dintre ele ar deveni peste noapte un atribut
   * lipsa — iar produsele lor ar inceta sa se publice fara ca nimeni sa fi atins nimic.
   */
  assert.equal(rezolvaAtribut("nou", PRODUS), "nou");
  assert.deepEqual(rezolvaAtribut(["a", "b"], PRODUS), ["a", "b"]);
  /* Un sir gol nu e o valoare: nu se trimite. */
  assert.equal(rezolvaAtribut("   ", PRODUS), undefined);
  assert.equal(rezolvaAtribut([], PRODUS), undefined);
});

test("⚠ valoarea vine din CAMPUL produsului", () => {
  assert.equal(rezolvaAtribut({ sursa: "camp", camp: "brand" }, PRODUS), "Nike");
  assert.equal(rezolvaAtribut({ sursa: "camp", camp: "nume" }, PRODUS), "Pantofi sport Air");
  assert.equal(rezolvaAtribut({ sursa: "camp", camp: "sku" }, PRODUS), "PS-001");
  assert.equal(rezolvaAtribut({ sursa: "camp", camp: "gtin" }, PRODUS), "5901234123457");
});

test("⚠ si din specificatiile scrise de om, fara sa conteze diacriticele", () => {
  /*
   * ⚠ Etichetele le scrie omul in editorul de produs. „Culoare", „culoare" si „CULOARE" sunt
   * acelasi lucru pentru el, si trebuie sa fie si pentru noi — altfel maparea „merge la unele
   * produse si nu merge la altele", ceea ce e cel mai greu de inteles fel de defect.
   */
  assert.equal(rezolvaAtribut({ sursa: "specificatie", eticheta: "Culoare" }, PRODUS), "Roșu");
  assert.equal(rezolvaAtribut({ sursa: "specificatie", eticheta: "  culoare " }, PRODUS), "Roșu");
  assert.equal(rezolvaAtribut({ sursa: "specificatie", eticheta: "Marime" }, PRODUS), undefined,
    "o specificatie care nu exista nu se inventeaza");
});

test("⚠ si din optiunile de varianta, cu toate valorile lor", () => {
  /*
   * ⚠ Un anunt OLX e pe PRODUS, nu pe varianta. Deci „Mărime" inseamna toate marimile pe care le
   * are produsul — iar daca atributul lor primeste o singura valoare, validarea de mai jos o
   * respinge INAINTE de publicare, nu OLX dupa.
   */
  assert.deepEqual(rezolvaAtribut({ sursa: "varianta", optiune: "Mărime" }, PRODUS), ["40", "41", "42"]);
  assert.deepEqual(rezolvaAtribut({ sursa: "varianta", optiune: "marime" }, PRODUS), ["40", "41", "42"]);
});

test("⚠ lantul cu rezerva: prima sursa care da ceva castiga", () => {
  /*
   * ═══ AICI E TOT ROSTUL PENTRU UN CATALOG ADEVARAT ═══
   *
   * `Brand` din campul produsului, si daca produsul n-are, din specificatia „Producător", si daca
   * nici aia, constanta „Altul". Fara rezerva, un singur produs fara brand ar bloca publicarea
   * intr-o categorie unde OLX cere atributul.
   */
  const faraBrand: MappableProduct = {
    ...PRODUS,
    page_sections: { specifications: [{ label: "Producător", value: "Fabrica SRL" }] },
  };
  const lant = [
    { sursa: "camp", camp: "brand" },
    { sursa: "specificatie", eticheta: "Producător" },
    { sursa: "constanta", valoare: "Altul" },
  ] as const;
  assert.equal(rezolvaAtribut([...lant], PRODUS), "Nike", "produsul are brand: se ia al lui");
  assert.equal(rezolvaAtribut([...lant], faraBrand), "Fabrica SRL", "n-are brand: cade pe specificatie");
  assert.equal(rezolvaAtribut([...lant], { ...PRODUS, page_sections: {} }), "Altul", "n-are nimic: constanta");
});

test("⚠ `page_sections` se citeste fara sa presupunem forma", () => {
  /*
   * ⚠ E jsonb: produsele vechi n-au cheile deloc, iar un import prost ar putea pune acolo un sir
   * sau o lista. O citire increzatoare ar fi aruncat in mijlocul unei publicari in masa.
   */
  for (const gunoi of [null, undefined, "text", 42, [], { specifications: "x" }, { variants: 7 }]) {
    const p = { ...PRODUS, page_sections: gunoi } as MappableProduct;
    assert.equal(rezolvaAtribut({ sursa: "specificatie", eticheta: "Culoare" }, p), undefined,
      `n-a rezistat la ${JSON.stringify(gunoi)}`);
    assert.equal(rezolvaAtribut({ sursa: "varianta", optiune: "Mărime" }, p), undefined);
    assert.equal(rezolvaAtribut({ sursa: "camp", camp: "brand" }, p), undefined);
  }
});

test("⚠ ce n-are valoare nu se trimite deloc", () => {
  /*
   * ⚠ Cheia trebuie sa lipseasca, nu sa plece goala: un atribut trimis cu sir vid e o valoare
   * declarata, si validarea lor il respinge altfel decat lipsa.
   */
  const out = rezolvaAtributele({
    state: "nou",
    brand: { sursa: "camp", camp: "brand" },
    model: { sursa: "specificatie", eticheta: "Nu exista" },
  }, PRODUS);
  assert.deepEqual(out, { state: "nou", brand: "Nike" });
  assert.equal("model" in out, false);
});

/* ── Validarea, dupa regulile LOR ────────────────────────────────────────── */

const DEF_LISTA: OlxAttributeDef = {
  code: "state", label: "Stare",
  validation: { type: "attribute", required: true },
  values: [{ code: "new", label: "Nou" }, { code: "used", label: "Folosit" }],
};
const DEF_NUMERIC: OlxAttributeDef = {
  code: "size", label: "Mărime",
  validation: { type: "attribute", numeric: true, min: 20, max: 50 },
};
const DEF_MULTE: OlxAttributeDef = {
  code: "colors", label: "Culori",
  validation: { type: "attribute", allow_multiple_values: true },
};

test("⚠ o valoare din afara listei LOR se opreste aici, nu la ei", () => {
  /*
   * ⚠ Pana azi se verifica numai `required`. Deci o valoare care nu e in lista lor pleca la ei si
   * se intorcea ca refuz, la PUBLICARE, pe produsul comerciantului — o cursa pe care n-are cum s-o
   * inteleaga, fiindca greseala era in mapare, nu in produs.
   *
   * ⚠ Se compara pe CODURI: `code` e ce accepta ei, `label` e ce vede omul.
   */
  assert.equal(nuSePotriveste(DEF_LISTA, "new"), null);
  assert.match(nuSePotriveste(DEF_LISTA, "Nou") ?? "", /nu e o valoare acceptată/);
  assert.match(nuSePotriveste(DEF_LISTA, "altceva") ?? "", /nu e o valoare acceptată/);
});

test("⚠ numerele se verifica, si marginile lor la fel", () => {
  assert.equal(nuSePotriveste(DEF_NUMERIC, "42"), null);
  assert.equal(nuSePotriveste(DEF_NUMERIC, "42,5"), null, "virgula romaneasca e tot un numar");
  assert.match(nuSePotriveste(DEF_NUMERIC, "mare") ?? "", /trebuie să fie un număr/);
  assert.match(nuSePotriveste(DEF_NUMERIC, "10") ?? "", /cel puțin 20/);
  assert.match(nuSePotriveste(DEF_NUMERIC, "80") ?? "", /cel mult 50/);
});

test("⚠ mai multe valori numai unde ei le primesc", () => {
  /*
   * ⚠ Chiar cazul de la „Mărime" luata din varianta: produsul are trei marimi, dar atributul lor
   * primeste una singura. Mai bine afla omul aici decat la publicare.
   */
  assert.equal(nuSePotriveste(DEF_MULTE, ["rosu", "albastru"]), null);
  assert.match(nuSePotriveste(DEF_NUMERIC, ["40", "41"]) ?? "", /o singură valoare/);
});

test("⚠ un atribut care nu mai exista in schema LOR se spune altfel", () => {
  /*
   * ⚠ Nu e greseala omului: e nomenclatorul lor care s-a schimbat sub maparea lui. Mesajul trebuie
   * sa-l trimita sa refaca maparea, nu sa-l puna sa caute o valoare gresita care nu exista.
   */
  const out = nereguliAtribute([DEF_LISTA], { state: "new", disparut: "x" });
  assert.equal(out.length, 1);
  assert.match(out[0], /nu mai există în categoria OLX/);
});

test("⚠ la SALVARE se verifica doar ca legatura exista", () => {
  /*
   * ⚠ In clipa salvarii maparii nu exista un produs anume, deci nu se poate sti ce valoare va iesi
   * dintr-o legatura. Se cere doar sa fie legata. Daca sursa nu da nimic pentru un produs, aflam la
   * publicare — si atunci mesajul e despre produsul acela, nu despre mapare.
   */
  const legate = legatoriDeAtribute({
    state: "new",
    brand: { sursa: "camp", camp: "brand" },
    gol: "",
  });
  assert.equal(legate.state, "new");
  assert.ok(legate.brand, "o legatura conteaza drept completata");
  assert.equal("gol" in legate, false, "un sir gol nu e o mapare");
});

test("⚠ corpul trimis la OLX chiar trece prin rezolvitor", () => {
  /* ⚠ Functiile pot fi perfecte si nefolosite: intre ele si corpul cererii sta o singura chemare. */
  const mapping = readFileSync("src/lib/olx/mapping.ts", "utf8");
  assert.match(mapping, /Object\.entries\(rezolvaAtributele\(entry\.attributes, product\)\)/);
  const actiuni = readFileSync("src/lib/actions/olx.actions.ts", "utf8");
  assert.match(actiuni, /const nereguli = nereguliAtribute\(attributes, constante\);/,
    "regulile lor se verifica si la salvarea maparii");
});
