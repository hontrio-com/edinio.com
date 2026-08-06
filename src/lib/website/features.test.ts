import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FEATURE_CARDS } from "./features";
import { SOLUTION_COLUMNS } from "./nav";

/*
 * Proba principala de aici tine butoanele cardurilor legate de meniu.
 *
 * Argumentul cu care s-au schimbat etichetele a fost ca site-ul trebuie sa spuna
 * UN nume per pagina: daca in meniu scrie „Curieri si AWB", butonul cardului nu
 * are voie sa spuna „Vezi toti curierii". Argumentul se pierde in sase luni daca
 * nu-l pazeste nimic — de-aia exista fisierul asta.
 */

/** Toate paginile din mega-meniu, ca harta href -> eticheta. */
const ETICHETE_MENIU = new Map(
  SOLUTION_COLUMNS.flatMap((coloana) =>
    coloana.items.map((item) => [item.href, item.label] as const),
  ),
);

test("meniul chiar contine paginile pe care le tintesc cardurile", () => {
  /* Fara asta, proba urmatoare ar trece degeaba daca meniul s-ar reorganiza si
     n-ar mai avea niciuna dintre pagini. */
  assert.ok(ETICHETE_MENIU.size >= 5, `meniul are doar ${ETICHETE_MENIU.size} pagini`);
});

test("eticheta butonului e numele paginii din meniu", () => {
  for (const card of FEATURE_CARDS) {
    const dinMeniu = ETICHETE_MENIU.get(card.cta.href);
    if (dinMeniu === undefined) {
      /* Cardul trimite undeva ce nu e in meniul de solutii. Se poate intampla
         legitim, dar atunci nu mai avem cu ce compara — se semnaleaza, nu se
         trece cu vederea. */
      assert.fail(
        `cardul „${card.id}" trimite la ${card.cta.href}, care nu e in mega-meniu. ` +
          `Daca e intentionat, adauga-l aici la exceptii cu un motiv scris.`,
      );
    }
    assert.equal(
      card.cta.label,
      dinMeniu,
      `cardul „${card.id}": butonul spune „${card.cta.label}", meniul spune „${dinMeniu}"`,
    );
  }
});

test("nicio eticheta nu incepe cu „Vezi”", () => {
  /* Erau cinci butoane care incepeau toate cu „Vezi", deci cuvantul care le
     deosebea statea la sfarsit, unde ochiul nu ajunge cand scaneaza. */
  for (const card of FEATURE_CARDS) {
    assert.ok(
      !/^vezi\b/i.test(card.cta.label),
      `cardul „${card.id}" a revenit la „${card.cta.label}"`,
    );
  }
});

test("etichetele incap in latimea comuna a butonului", () => {
  /* Butonul are `min-w-[212px]`, socotit pentru cea mai lunga eticheta de acum.
     `min-w` nu taie textul: o eticheta mai lunga umfla butonul si iese din rand,
     fara nicio eroare. Pragul e in CARACTERE, ca sa nu cerem masuratori de font
     intr-o proba — 20 e lungimea lui „Mentenanta gratuita" plus o rezerva. */
  for (const card of FEATURE_CARDS) {
    assert.ok(
      card.cta.label.length <= 20,
      `cardul „${card.id}": „${card.cta.label}" are ${card.cta.label.length} caractere, ` +
        `peste 20 — butonul iese mai lat decat celelalte`,
    );
  }
});

test("fiecare card are exact patru bife", () => {
  /* Nu e o preferinta: pe telefon se afiseaza doua pe rand, deci patru inseamna
     un patrat plin. Cu trei sau cu cinci, ultimul rand ramane pe jumatate gol. */
  for (const card of FEATURE_CARDS) {
    assert.equal(card.checks.length, 4, `cardul „${card.id}" are ${card.checks.length} bife`);
  }
});

test("nu exista doua carduri care sa trimita in acelasi loc", () => {
  const tinte = FEATURE_CARDS.map((c) => c.cta.href);
  assert.equal(
    new Set(tinte).size,
    tinte.length,
    `doua carduri trimit la aceeasi pagina: ${tinte.join(", ")}`,
  );
});
