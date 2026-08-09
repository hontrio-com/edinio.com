import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FEATURE_CARDS } from "./features";
import { SOLUTION_COLUMNS } from "./nav";

/*
 * Probele de aici pazesc lucrurile care se strica tacut la cardurile de functii:
 * un buton care trimite intr-o pagina inexistenta, o eticheta prea lunga care
 * strica randul, sau o a cincea bifa care lasa aranjarea pe jumatate goala.
 *
 * Ce NU se mai verifica: ca eticheta butonului e numele paginii din meniu. S-a
 * incercat, si clientul a cerut inapoi formele lungi („Vezi toate integrarile" in
 * loc de „Integrari"). Nota e in `features.ts`, la `cta`.
 */

/** Toate paginile din mega-meniu, ca harta href -> eticheta. */
const ETICHETE_MENIU = new Map(
  SOLUTION_COLUMNS.flatMap((coloana) =>
    coloana.items.map((item) => [item.href, item.label] as const),
  ),
);

test("fiecare card trimite la o pagina care exista in meniu", () => {
  /* Nota veche de aici zicea ca `/migrare` e legat de doua ori din `nav.ts` fara
     sa existe pagina. E GRESITA si a fost corectata (2026-08-10): pagina exista,
     doar ca in alt grup de rute — `app/(landing)/migrare`, nu `app/(website)`.
     Grupurile in paranteze nu apar in adresa, deci `/migrare` raspunde.
     Proba ramane utila: un href scris gresit intr-un card ar duce tacut in 404. */
  assert.ok(ETICHETE_MENIU.size >= 5, `meniul are doar ${ETICHETE_MENIU.size} pagini`);
  for (const card of FEATURE_CARDS) {
    assert.ok(
      ETICHETE_MENIU.has(card.cta.href),
      `cardul „${card.id}" trimite la ${card.cta.href}, care nu e in mega-meniu — ` +
        `verifica daca pagina exista`,
    );
  }
});

test("etichetele incap in latimea comuna a butonului", () => {
  /* Butonul are `sm:min-w-[288px]`, socotit pentru „Vezi cum optimizam magazinul"
     (278px masurati) plus o rezerva. `min-w` nu taie textul: o eticheta mai lunga
     umfla butonul ei si iese din rand, fara nicio eroare. Pragul e in CARACTERE,
     ca sa nu cerem masuratori de font intr-o proba — 30 e cea mai lunga de acum,
     28, plus doua de rezerva. */
  for (const card of FEATURE_CARDS) {
    assert.ok(
      card.cta.label.length <= 30,
      `cardul „${card.id}": „${card.cta.label}" are ${card.cta.label.length} caractere, ` +
        `peste 30 — butonul iese mai lat decat celelalte`,
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
