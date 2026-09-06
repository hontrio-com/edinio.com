import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MAX_CAMPURI, MAX_OPTIUNI } from "./definitie";
import { problemaPersonalizarii } from "./salvare";

/**
 * Ce salveaza comerciantul se si serveste — sau afla de ce nu.
 *
 * ═══ ⚠ CE COSTA CAND NU EXISTA PROBA ASTA ═══
 *
 * Cititorul e bland dinadins, si asta e bine: un `page_sections` scris strambe n-are voie sa
 * opreasca o vanzare. Dar aceeasi blandete, la SCRIERE, inseamna „Salvat" peste o configurare care
 * nu se poate servi. Cele doua purtari trebuie sa existe amandoua, si tocmai fiindca se bat cap in
 * cap merita probate una langa alta.
 *
 * ⚠ CEL MAI SCUMP CAZ E MODUL DE PRET CAZUT INAPOI, fiindca e singurul care schimba BANII fara sa
 * schimbe nimic pe ecran: comerciantul vede „Calculat din suprafata", si se incaseaza pretul de
 * catalog.
 */

function camp(i: number) {
  return { id: `c${i}`, type: "text", label: `Camp ${i}`, required: false };
}

test("⚠ personalizarea care se poate servi intreaga NU deranjeaza pe nimeni", () => {
  /*
   * Perechea obligatorie a fiecarei probe de mai jos: o poarta care spune „nu" la tot ar fi trecut
   * toate refuzurile si ar fi blocat fiecare salvare din magazin.
   */
  assert.equal(problemaPersonalizarii(null), null);
  assert.equal(problemaPersonalizarii({}), null);
  assert.equal(problemaPersonalizarii({ customization: { enabled: false, fields: [] } }), null);
  assert.equal(problemaPersonalizarii({ customization: { enabled: true, fields: [] } }), null);
  /* Cele 29 din productie: text, textarea, image, fara niciun pret. */
  assert.equal(
    problemaPersonalizarii({ customization: { enabled: true, fields: [
      { id: "f1", type: "text", label: "Nume gravat", required: true, max_length: 20 },
      { id: "f2", type: "image", label: "Poza", required: false },
    ] } }),
    null,
  );
  /* Si fototapetul intreg, cu pret pe suprafata. */
  assert.equal(
    problemaPersonalizarii({ customization: {
      enabled: true,
      fields: [
        { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
        { id: "mat", type: "butoane", label: "Material", required: true, optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ] },
      ],
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
        includePretulProdusului: false },
    } }),
    null,
  );
});

test("⚠ campul al 31-lea se REFUZA la salvare, nu se arunca in tacere la citire", () => {
  /*
   * ⚠ CE SE INTAMPLA FARA POARTA: `normalizeazaDefinitia` taie la `MAX_CAMPURI`, iar comerciantul
   * primeste „Salvat". Deschide vitrina si numara 30 de campuri din 31, fara ca ceva sa spuna care
   * lipseste sau de ce. Cauta o ora in propriul formular.
   */
  const prea = { customization: {
    enabled: true,
    fields: Array.from({ length: MAX_CAMPURI + 1 }, (_, i) => camp(i)),
  } };
  const mesaj = problemaPersonalizarii(prea);
  assert.ok(mesaj, "campul in plus a trecut");
  assert.match(mesaj, new RegExp(String(MAX_CAMPURI)), "mesajul nu spune care e plafonul");

  /* Perechea: exact la plafon se salveaza. */
  assert.equal(
    problemaPersonalizarii({ customization: {
      enabled: true, fields: Array.from({ length: MAX_CAMPURI }, (_, i) => camp(i)),
    } }),
    null,
  );
});

test("⚠ un camp pe care cititorul l-ar arunca se spune, nu se pierde", () => {
  /* Tip necunoscut, si `id` care se repeta — amandoua sunt aruncate tacut la citire. */
  for (const fields of [
    [camp(1), { id: "x", type: "hologram", label: "Hologram" }],
    [camp(1), { id: "c1", type: "text", label: "Acelasi id" }],
    [camp(1), { type: "text", label: "Fara id" }],
  ]) {
    const mesaj = problemaPersonalizarii({ customization: { enabled: true, fields } });
    assert.ok(mesaj, `au trecut: ${JSON.stringify(fields)}`);
  }

  /* Si cand NIMIC nu se poate citi, mesajul e altul — mai limpede decat „un camp". */
  const totRau = problemaPersonalizarii({ customization: {
    enabled: true, fields: [{ type: "hologram" }],
  } });
  assert.match(String(totRau), /niciun camp/);
});

test("⚠ optiunile peste plafon, si cele care nu se pot folosi", () => {
  const prea = problemaPersonalizarii({ customization: { enabled: true, fields: [
    { id: "b", type: "butoane", label: "Material", required: true,
      optiuni: Array.from({ length: MAX_OPTIUNI + 1 }, (_, i) => ({ id: `o${i}`, eticheta: `O${i}` })) },
  ] } });
  assert.ok(prea, "optiunea in plus a trecut");
  assert.match(prea, /Material/, "mesajul nu spune care camp");

  const duplicate = problemaPersonalizarii({ customization: { enabled: true, fields: [
    { id: "b", type: "butoane", label: "Material", required: true, optiuni: [
      { id: "std", eticheta: "Standard" }, { id: "std", eticheta: "Iar Standard" },
    ] },
  ] } });
  assert.ok(duplicate, "doua optiuni cu acelasi id au trecut");
});

test("⚠ MODUL DE PRET CAZUT INAPOI: singurul care schimba banii fara sa schimbe ecranul", () => {
  /*
   * ⚠ ASTA E CAZUL PENTRU CARE EXISTA FISIERUL. Comerciantul alege „Calculat din suprafata", pune
   * tarifele pe optiuni si lasa caseta „Tarif lei/m²" pe 0 — n-are ce scrie acolo. Dar `mat` ramane
   * OPTIONAL, iar `citestePret` cere ca sursa de tarif sa poata fi aleasa. Modul cade pe „adaugat",
   * ecranul ramane pe „Calculat din suprafata", si se incaseaza pretul de catalog.
   *
   * Cele cinci feluri in care cade modul, fiecare cu propriul rand aici.
   */
  const baza = {
    id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
    latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 },
  };
  const cazuri: Array<[string, unknown]> = [
    ["camp de dimensiuni inexistent", { customization: { enabled: true, fields: [baza],
      pret: { fel: "suprafata", campDimensiuni: "nu-exista", tarif: 69, includePretulProdusului: false } } }],
    ["tarif zero, fara sursa", { customization: { enabled: true, fields: [baza],
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 0, includePretulProdusului: false } } }],
    ["o optiune de tarif fara pret pe m²", { customization: { enabled: true, fields: [baza,
      { id: "mat", type: "butoane", label: "Material", required: true, optiuni: [
        { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
        { id: "uit", eticheta: "Uitat" },
      ] }],
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 0, campTarif: "mat",
        includePretulProdusului: false } } }],
    ["o optiune de tarif cu pret FIX", { customization: { enabled: true, fields: [baza,
      { id: "mat", type: "butoane", label: "Material", required: true, optiuni: [
        { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
        { id: "fix", eticheta: "Cu pret fix", impact: { fel: "fix", suma: 15 } },
      ] }],
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
        includePretulProdusului: false } } }],
    ["laturi nemarginite, fara suprafata minima", { customization: { enabled: true, fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm" }],
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 89, includePretulProdusului: false } } }],
  ];
  for (const [nume, ps] of cazuri) {
    const mesaj = problemaPersonalizarii(ps);
    assert.ok(mesaj, `a trecut in tacere: ${nume}`);
    assert.match(mesaj, /suprafata/i, `mesajul nu spune despre ce e vorba: ${nume}`);
  }
});

test("⚠ poarta e CHEMATA in amandoua actiunile de salvare, nu doar scrisa", () => {
  /*
   * O poarta pura care nu se cheama nu apara nimic, si nici tsc, nici probele de mai sus n-ar fi
   * observat-o: functia ar fi ramas verde in izolare, iar salvarile ar fi trecut ca inainte.
   *
   * ⚠ Se cere si ca ce se SCRIE in baza sa ramana ce a trimis omul: normalizarea scrisa ar fi
   * atins cele 29 de randuri existente si ar fi stricat exact proprietatea pentru care cititorul e
   * bland.
   */
  const s = readFileSync(
    path.resolve(process.cwd(), "src/lib/actions/product.actions.ts"), "utf8",
  ).replace(/\r\n/g, "\n");
  assert.match(s, /import \{ problemaPersonalizarii \} from "@\/lib\/customization\/salvare";/);
  assert.equal(
    (s.match(/const problemaPers = problemaPersonalizarii\(data\.page_sections\);/g) ?? []).length, 2,
    "poarta nu se cheama in amandoua actiunile (creare si actualizare)",
  );
  assert.equal(
    (s.match(/if \(problemaPers\) return \{ error: problemaPers \};/g) ?? []).length, 2,
    "poarta se socoteste, dar nu opreste salvarea",
  );
  assert.equal(
    (s.match(/page_sections: \(data\.page_sections \?\? \{\}\) as never,/g) ?? []).length, 2,
    "in baza nu se mai scrie ce a trimis comerciantul",
  );
});
