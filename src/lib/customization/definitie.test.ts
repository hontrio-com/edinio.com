import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CAMPURI, MAX_OPTIUNI,
  cerePersonalizarea, citesteImpact, normalizeazaDefinitia,
} from "./definitie";

/**
 * Cititorul formei de personalizare.
 *
 * ⚠ CE APARA, INAINTE DE ORICE: cele 29 de produse care folosesc personalizarea AZI, in 4
 * magazine, cu 49 de campuri din care 20 obligatorii. Ele n-au fost resalvate si nu vor fi: daca
 * cititorul asta le citeste altfel decat le-a scris formularul, magazinele lor se strica fara ca
 * nimeni sa fi atins nimic.
 *
 * Tipurile folosite in productie sunt DOAR `text`, `textarea` si `image` — masurat, nu presupus.
 */

/** Forma EXACTA scrisa azi de `ProductForm`, cu cele noua chei ale ei. */
const CAMP_VECHI = {
  id: "f1",
  type: "text",
  label: "Nume gravat",
  placeholder: "Robert",
  required: true,
  max_length: 20,
  max_files: 5,
  max_file_size_mb: 10,
  helper_text: "Cel mult 20 de caractere",
};

test("⚠ LEGACY: forma de azi se citeste NEATINSA", () => {
  const d = normalizeazaDefinitia({ enabled: true, fields: [CAMP_VECHI] });
  assert.ok(d);
  const c = d.fields[0];
  assert.equal(c.id, "f1");
  assert.equal(c.type, "text");
  assert.equal(c.label, "Nume gravat");
  assert.equal(c.placeholder, "Robert");
  assert.equal(c.required, true);
  assert.equal(c.max_length, 20);
  assert.equal(c.helper_text, "Cel mult 20 de caractere");
  /* ⚠ Fara pret: un produs vechi nu devine deodata mai scump. */
  assert.equal(c.impact, undefined);
  assert.equal(d.pret, undefined);
});

test("⚠ LEGACY: cele trei tipuri folosite in productie trec toate", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "a", type: "text", label: "A", required: true, max_length: 30 },
      { id: "b", type: "textarea", label: "B", required: false, max_length: 500 },
      { id: "c", type: "image", label: "C", required: true, max_files: 3, max_file_size_mb: 8 },
    ],
  });
  assert.ok(d);
  assert.equal(d.fields.length, 3);
  assert.equal(d.fields[2].max_files, 3);
  assert.equal(d.fields[2].max_file_size_mb, 8);
});

test("⚠ LEGACY: `select` ramane pe siruri, fara id-uri", () => {
  /*
   * ⚠ Niciun produs din productie nu foloseste `select`, deci nu exista date de migrat. Tocmai de
   * aceea nu se atinge: forma noua cu id-uri se numeste `butoane`, iar `select` ramane exact cum
   * era. O „modernizare" a lui ar fi fost o migrare fara niciun castig.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "s", type: "select", label: "Marime", required: true, options: ["S", "M", "L"] }],
  });
  assert.ok(d);
  assert.deepEqual(d.fields[0].options, ["S", "M", "L"]);
  assert.equal(d.fields[0].optiuni, undefined);
});

test("⚠ personalizarea stinsa sau goala inseamna NIMIC", () => {
  assert.equal(normalizeazaDefinitia(null), null);
  assert.equal(normalizeazaDefinitia({ enabled: false, fields: [CAMP_VECHI] }), null);
  assert.equal(normalizeazaDefinitia({ enabled: true, fields: [] }), null);
  assert.equal(normalizeazaDefinitia({ enabled: true }), null);
  /* ⚠ Un camp pe care cititorul il arunca nu face produsul „personalizabil". */
  assert.equal(normalizeazaDefinitia({ enabled: true, fields: [{ type: "text" }] }), null);
});

test("⚠ `cerePersonalizarea` da acelasi verdict ca cititorul", () => {
  /*
   * Doua raspunsuri la aceeasi intrebare ar fi insemnat un produs care ascunde butonul de cos
   * pentru un formular care iese gol — clientul n-ar mai fi avut nicio cale sa cumpere.
   */
  assert.equal(cerePersonalizarea({ customization: { enabled: true, fields: [CAMP_VECHI] } }), true);
  assert.equal(cerePersonalizarea({ customization: { enabled: true, fields: [{ type: "text" }] } }), false);
  assert.equal(cerePersonalizarea({ customization: { enabled: false, fields: [CAMP_VECHI] } }), false);
  assert.equal(cerePersonalizarea(null), false);
  assert.equal(cerePersonalizarea({}), false);
});

test("⚠ id-urile duplicate se arunca", () => {
  /*
   * Valorile clientului se cheiesc pe `id`. Doua campuri cu acelasi id ar fi impartit o singura
   * valoare: omul completeaza al doilea camp si vede cum se schimba primul.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "x", type: "text", label: "Primul", required: false },
      { id: "x", type: "text", label: "Al doilea", required: false },
    ],
  });
  assert.ok(d);
  assert.equal(d.fields.length, 1);
  assert.equal(d.fields[0].label, "Primul");
});

test("⚠ un camp fara `id` se arunca, nu se numeroteaza dupa pozitie", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ type: "text", label: "Fara id", required: true }, CAMP_VECHI],
  });
  assert.ok(d);
  assert.equal(d.fields.length, 1);
  assert.equal(d.fields[0].id, "f1");
});

test("⚠ plafoanele se aplica la CITIRE, deci si pe randurile care exista deja", () => {
  const multe = Array.from({ length: MAX_CAMPURI + 20 }, (_, i) => ({
    id: `c${i}`, type: "text", label: `C${i}`, required: false,
  }));
  const d = normalizeazaDefinitia({ enabled: true, fields: multe });
  assert.equal(d?.fields.length, MAX_CAMPURI);

  const opt = Array.from({ length: MAX_OPTIUNI + 10 }, (_, i) => ({ id: `o${i}`, eticheta: `O${i}` }));
  const b = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "b", type: "butoane", label: "B", required: true, optiuni: opt }],
  });
  assert.equal(b?.fields[0].optiuni?.length, MAX_OPTIUNI);
});

test("⚠ optiunile fara `id` se arunca; cele duplicate, la fel", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{
      id: "b", type: "butoane", label: "Material", required: true,
      optiuni: [
        { eticheta: "Fara id" },
        { id: "std", eticheta: "Standard" },
        { id: "std", eticheta: "Standard din nou" },
      ],
    }],
  });
  assert.equal(d?.fields[0].optiuni?.length, 1);
  assert.equal(d?.fields[0].optiuni?.[0].eticheta, "Standard");
});

test("⚠ sumele negative NU devin preturi", () => {
  /*
   * O reducere pe optiune pare inofensiva, dar cu doua-trei negative pretul liniei poate cobori
   * sub zero, iar de acolo fiecare socoteala a platformei primeste un numar in care nu crede.
   */
  assert.deepEqual(citesteImpact({ fel: "fix", suma: -10 }), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "pe_m2", suma: -1 }), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "fix" }), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "fix", suma: "nu-i numar" }), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "inventat", suma: 10 }), { fel: "fara" });
  assert.deepEqual(citesteImpact(null), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "fix", suma: 20 }), { fel: "fix", suma: 20 });
});

test("⚠ o latura cu margini absurde se arunca, ca sa nu blocheze campul", () => {
  /*
   * Cu `min > max` nicio valoare nu trece validarea, iar clientul ramane blocat pe un camp
   * obligatoriu fara sa inteleaga de ce. Se arunca latura, si campul se poarta ca nemarginit.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{
      id: "d", type: "dimensiuni", label: "D", required: true, unitate: "cm",
      latime: { min: 500, max: 100 },
      inaltime: { min: 70, max: 350 },
    }],
  });
  assert.equal(d?.fields[0].latime, undefined);
  assert.deepEqual(d?.fields[0].inaltime, { min: 70, max: 350 });
});

test("⚠ unitatea necunoscuta cade pe centimetri, nu pe nimic", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "d", type: "dimensiuni", label: "D", required: true, unitate: "leghe",
      latime: { min: 1, max: 2 }, inaltime: { min: 1, max: 2 } }],
  });
  assert.equal(d?.fields[0].unitate, "cm");
});

test("⚠ pretul pe CAMP nu se citeste la `butoane` si `select`", () => {
  /*
   * Acolo alegerea e o optiune, deci pretul sta pe ea. Citit si pe camp, comerciantul ar fi putut
   * pune doua preturi pentru aceeasi alegere, si n-ar mai fi fost limpede din ecran ce se incaseaza.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "b", type: "butoane", label: "B", required: true, impact: { fel: "fix", suma: 50 },
        optiuni: [{ id: "x", eticheta: "X" }] },
      { id: "t", type: "text", label: "T", required: false, impact: { fel: "fix", suma: 20 } },
    ],
  });
  assert.equal(d?.fields[0].impact, undefined);
  assert.deepEqual(d?.fields[1].impact, { fel: "fix", suma: 20 });
});

test("⚠ nu arunca niciodata, oricat de strambe ar fi datele", () => {
  /*
   * E chemata si pe drumul comenzii. O exceptie de aici ar fi oprit o vanzare pentru un
   * `page_sections` scris gresit — adica un magazin care nu mai poate incasa, dintr-o virgula.
   */
  for (const intrare of [
    undefined, null, 0, "", "text", [], { fields: null },
    { enabled: true, fields: "nu-i tablou" },
    { enabled: true, fields: [null, undefined, 5, "x", []] },
    { enabled: true, fields: [CAMP_VECHI], pret: "stricat" },
    { enabled: true, fields: [CAMP_VECHI], pret: { fel: "suprafata" } },
  ]) {
    assert.doesNotThrow(() => normalizeazaDefinitia(intrare), `a aruncat pe ${JSON.stringify(intrare)}`);
  }
});
