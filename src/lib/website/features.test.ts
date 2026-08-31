import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existaPaginaStatica } from "./rute-pe-disc";
import { FEATURE_CARDS } from "./features";

const AICI = dirname(fileURLToPath(import.meta.url));
const APP = join(AICI, "..", "..", "app");

/*
  ⚠ REZOLVATORUL DE RUTE NU MAI E AICI. Statea si in fisierul asta, si in
  celalalt, cu aceleasi comentarii copiate — iar pe 31.08.2026 era pe cale sa
  apara a treia copie. Acum e unul singur, in `rute-pe-disc.ts`, unde scrie si
  de ce segmentele dinamice se potrivesc peste tot in afara de `(public)`.
*/

/*
 * Probele de aici pazesc lucrurile care se strica tacut la cardurile de functii:
 * un buton care trimite intr-o pagina inexistenta, o eticheta prea lunga care
 * strica randul, sau o a cincea bifa care lasa aranjarea pe jumatate goala.
 *
 * Ce NU se mai verifica: ca eticheta butonului e numele paginii din meniu. S-a
 * incercat, si clientul a cerut inapoi formele lungi („Vezi toate integrarile" in
 * loc de „Integrari"). Nota e in `features.ts`, la `cta`.
 */

test("fiecare card trimite la o pagină care există", () => {
  /*
    ⚠ PROBA ÎNTREABĂ SISTEMUL DE FIȘIERE, nu mega-meniul.

    Până la 13.08 verifica dacă adresa cardului e una dintre paginile din meniu.
    Era un ocol: rostul ei e să prindă un href scris greșit, care ar duce tăcut
    în 404 — nici `tsc`, nici `eslint` nu știu ce rute există. Apartenența la
    meniu era doar un semn că pagina e reală.

    Ocolul s-a rupt când clientul a scos „Magazin online" din meniu și l-a
    trimis pe pagina de start: cardul rămăsese cu o adresă bună, la o pagină
    care există, dar proba pica. Acum se întreabă direct App Router-ul, deci
    răspunde la ce trebuia să răspundă de la început.

    Ancora se taie înainte de căutare: `/#preturi` e tot pagina de start.
  */
  for (const card of FEATURE_CARDS) {
    assert.ok(
      existaPaginaStatica(card.cta.href),
      `cardul „${card.id}" trimite la ${card.cta.href}, care nu are pagină`,
    );
  }
});

test("resolverul de rute chiar poate esua", () => {
  /* Control negativ. Fără el, o greșeală în `cauta()` ar face proba de mai sus
     să răspundă „da" la orice și n-ar mai păzi nimic — exact scăparea prinsă o
     dată în `footer.test.ts`. */
  assert.equal(existaPaginaStatica("/pagina-care-nu-exista-nicaieri"), false);
  assert.equal(existaPaginaStatica("/"), true, "pagina de start trebuie să existe");
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
