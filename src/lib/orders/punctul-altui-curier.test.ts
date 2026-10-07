import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { eComandaDePunct, punctulAltuiCurier } from "./punctul-altui-curier";

/*
 * Punctul ALTUI curier: adresa de pe comanda e a PUNCTULUI. Regula si masuratoarea stau in
 * `punctul-altui-curier.ts`. Formele de mai jos sunt cele reale din productie (07.10.2026), cu
 * date inventate.
 */

const CHECKOUT_FANBOX = {
  city: "Sector 3", county: "Municipiul Bucuresti",
  address: "Bd. Theodor Pallady 51, Bucuresti",
  courier: "curiera", courier_label: "Curiera: locker sau punct de ridicare",
  delivery_type: "locker", locker_id: "16478", locker_name: "FANbox Kaufland Theodor Pallady",
  locker_address: "Bd. Theodor Pallady 51, Bucuresti",
};

const EMAG_EASYBOX = {
  source: "emag", city: "Iasi", county: "Iasi", street: "Bd. Exemplu 1", postal_code: "700001",
  locker_id: "1234", locker_name: "easybox Mall Exemplu",
};

const LA_ADRESA = { city: "Cluj-Napoca", county: "Cluj", address: "Str. Mare 12", courier: "dpd" };

describe("Ce e o comanda de punct", () => {
  test("checkoutul o marcheaza cu `delivery_type`; eMAG doar cu `locker_id`", () => {
    assert.equal(eComandaDePunct(CHECKOUT_FANBOX), true);
    assert.equal(eComandaDePunct(EMAG_EASYBOX), true);
    assert.equal(eComandaDePunct(LA_ADRESA), false);
    assert.equal(eComandaDePunct({ locker_id: "  " }), false);
    assert.equal(eComandaDePunct(null), false);
  });
});

describe("Punctul altui curier", () => {
  test("la adresa: nimic de spus", () => {
    assert.equal(punctulAltuiCurier(LA_ADRESA, (c) => c === "cargus"), null);
  });

  test("punctul chiar al ferestrei: nimic de spus (fereastra il foloseste)", () => {
    assert.equal(punctulAltuiCurier(CHECKOUT_FANBOX, (c) => c === "curiera"), null);
    /* `courier` vine scris cum vine: se compara mic si fara spatii. */
    assert.equal(punctulAltuiCurier({ ...CHECKOUT_FANBOX, courier: " Curiera " }, (c) => c === "curiera"), null);
  });

  test("⚠⚠ punctul altui curier: strada e cea de ACASA, niciodata a punctului", () => {
    const fara = punctulAltuiCurier(CHECKOUT_FANBOX, (c) => c === "dpd");
    assert.deepEqual(fara, {
      numePunct: "FANbox Kaufland Theodor Pallady",
      dePe: "Curiera: locker sau punct de ridicare",
      linieAcasa: "",
    });
    const cu = punctulAltuiCurier({ ...CHECKOUT_FANBOX, home_address: " Bd. Unirii nr. 5 " }, (c) => c === "dpd");
    assert.equal(cu?.linieAcasa, "Bd. Unirii nr. 5");
  });

  test("⚠⚠ easybox-ul eMAG e strain pentru ORICE fereastra, si poarta numele eMAG", () => {
    for (const curier of ["sameday", "dpd", "woot", "ecolet"]) {
      const r = punctulAltuiCurier(EMAG_EASYBOX, (c) => c === curier);
      assert.ok(r, curier);
      assert.equal(r.dePe, "eMAG");
      assert.equal(r.linieAcasa, "", "eMAG nu trimite adresa de acasa; strada lui e a punctului");
    }
  });
});

/*
 * ⚠ PE ELEMENT, nu pe fisier: fiecare fereastra de AWB, numita, cere regula si avertismentul.
 * O fereastra noua care completeaza strada din comanda fara regula ar repeta defectul.
 */
const DIR = "src/components/dashboard/";
const FERESTRE = readdirSync(DIR).filter((f) => /AwbModal\.tsx$/.test(f));
/* eMAG emite prin marketplace; e-packet are regula in `src/lib/epacket/livrare.ts`. */
const CU_REGULA_PROPRIE = new Set(["EmagAwbModal.tsx", "EpacketAwbModal.tsx"]);

describe("Fiecare fereastra de AWB foloseste regula", () => {
  test("sunt toate cele 20 de ferestre (o fereastra noua trebuie gandita aici)", () => {
    assert.equal(FERESTRE.length, 20, FERESTRE.join(", "));
  });
  for (const f of FERESTRE.filter((x) => !CU_REGULA_PROPRIE.has(x))) {
    test(`${f}: strada din regula si avertismentul pe ecran`, () => {
      const s = readFileSync(DIR + f, "utf8");
      assert.match(s, /const punctStrain = punctulAltuiCurier\(addr, /, `${f} nu intreaba daca punctul e al altui curier`);
      /* eColet n-are camp de strada in fereastra: o citeste serverul (proba de mai jos). */
      if (f !== "EcoletAwbModal.tsx") {
        assert.match(s, /punctStrain \? punctStrain\.linieAcasa : /, `${f} completeaza strada fara regula`);
      }
      assert.match(s, /<PunctAltuiCurier punct=\{punctStrain\}/, `${f} nu arata avertismentul`);
    });
  }
  test("eColet citeste strada pe SERVER, deci regula e si acolo, la cotatie si la emitere", () => {
    const s = readFileSync("src/lib/actions/ecolet.actions.ts", "utf8");
    assert.equal((s.match(/= stradaEcolet\(/g) ?? []).length, 2);
    assert.match(s, /punctulAltuiCurier\(addr, \(c\) => c === "ecolet"\)/);
  });
  test("lotul intreaba inainte de orice curier", () => {
    const s = readFileSync("src/lib/actions/bulk-orders.actions.ts", "utf8");
    const garda = s.indexOf("const strain = punctulAltuiCurier(addr");
    const primulCurier = s.indexOf('case "cargus":', garda);
    assert.ok(garda > 0 && primulCurier > garda, "garda trebuie sa fie in createAwbForOrder, inainte de switch");
  });
});
