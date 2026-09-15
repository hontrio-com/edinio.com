import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { valoareaDeclarataLaCurier } from "@/lib/shipping/optiuni-de-rezerva";

/* ══════════════════════════════════════════════════════════════════════════
   VALOAREA DECLARATA NU COBOARA SUB CE SUSTINE CATALOGUL        (15.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ ULTIMUL DRUM PRIN CARE COSUL MISCA BANI FARA POARTA, si nu venea din niciun audit extern.

   La DHL valoarea marfii intra CHIAR IN TARIF: asigurarea lor e „55.00 LEI or 1% of insured
   value, if higher", iar suprataxele de valoare se trag tot din ea. Valoarea pleca din
   `min(subtotalul din browser, plafonul din catalog)`, deci `subtotal: 0.01` scotea un tarif mai
   mic. Tariful acela pleca SEMNAT si se accepta la comanda; la emitere insa pleaca valoarea
   ADEVARATA, iar DHL factureaza dupa ea. Diferenta o platea comerciantul, pe fiecare colet.

   ⚠ DOUA PERICOLE OPUSE, ACEEASI CIFRA. Plafonul din catalog era corect pentru REGULILE de
   transport, unde pericolul e umflarea (livrare gratuita semnata pentru un cos ieftin). La
   valoarea declarata pericolul e coborarea. Cine „uniformizeaza" cele doua numere redeschide
   exact cealalta gaura, si de aia probele de mai jos le apara pe amandoua.

   ⚠ ZERO INSTANTE VII la data reparatiei: nicio configurare DHL si nicio zona DHL pornita in
   toata platforma. S-a inchis INAINTE ca cineva sa porneasca DHL.
*/

/* ── Regula ───────────────────────────────────────────────────────────────── */

test("⚠⚠ subdeclararea urca la cat sustine catalogul", () => {
  /* Chiar atacul: `subtotal: 0.01` scotea un tarif DHL aproape fara componenta de valoare. */
  assert.equal(valoareaDeclarataLaCurier(0.01, 500), 500);
  assert.equal(valoareaDeclarataLaCurier(0, 500), 500);
  assert.equal(valoareaDeclarataLaCurier(-9000, 500), 500);
});

test("⚠ CUMPARATORUL CINSTIT NU E ATINS: se declara chiar numarul lui", () => {
  /*
   * ⚠ Jumatatea care face reparatia sigura. Un `max` nu poate cobori niciodata valoarea ceruta,
   * deci niciun cos cinstit nu-si schimba tariful. Si conteaza: cosul poate purta ceva ce
   * catalogul de AZI nu mai stie sa repretuiasca (o personalizare schimbata intre timp), iar
   * acolo numarul lui e mai aproape de adevar decat al nostru.
   */
  assert.equal(valoareaDeclarataLaCurier(518, 500), 518);
  assert.equal(valoareaDeclarataLaCurier(500, 500), 500);
  assert.equal(valoareaDeclarataLaCurier(1200, 500), 1200);
});

test("⚠ podeaua nu COBOARA niciodata valoarea ceruta", () => {
  for (const cerut of [0.01, 1, 17, 99.99, 500, 1200, 10_000]) {
    assert.ok(
      valoareaDeclarataLaCurier(cerut, 500) >= cerut,
      `valoarea ceruta ${cerut} a fost coborata: coletul ar pleca asigurat sub valoarea lui`,
    );
  }
});

test("⚠ si nimic nu pleaca `NaN` catre curier", () => {
  /* `Number(undefined)` e `NaN`, iar `Math.max` cu un `NaN` intoarce `NaN`, care ar fi plecat ca
     atare in cererea de tarif. */
  assert.equal(valoareaDeclarataLaCurier(undefined, 500), 500);
  assert.equal(valoareaDeclarataLaCurier("nu e numar", 500), 500);
  assert.equal(valoareaDeclarataLaCurier(500, Number.NaN), 500);
  assert.equal(valoareaDeclarataLaCurier(undefined, Number.NaN), 0);
});

/* ── ⚠ Si apelantul, fiindca regula singura n-apara nimic ─────────────────── */

const COTARE = "src/lib/actions/shipping.actions.ts";
const sursa = () =>
  readFileSync(COTARE, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠⚠ cotarea DHL primeste valoarea CU PODEA, nu pe cea plafonata", () => {
  const s = sursa();
  assert.match(
    s, /const valoareDeclarata = valoareaDeclarataLaCurier\(destination\.subtotal, podeaDinCatalog\)/,
    "cotarea nu mai calculeaza valoarea declarata prin regula cu podea",
  );
  assert.match(
    s, /buildDhlOptions\(dhlCfg, destination, weight, valoareDeclarata,/,
    "DHL primeste iar o valoare pe care browserul o poate cobori: tariful ar iesi sub cel facturat",
  );
  assert.doesNotMatch(
    s, /buildDhlOptions\([^)]*valoareMarfii/,
    "DHL primeste iar `valoareMarfii`, adica `min(browser, catalog)`",
  );
});

test("⚠⚠ iar REGULILE de transport raman pe plafon, ca sa nu se deschida gaura opusa", () => {
  /*
   * ⚠ Cele doua numere trebuie sa RAMANA doua. Cine le uniformizeaza „ca sa fie una singura"
   * repara un pericol si deschide celalalt: cu podea in locul plafonului, un cos ieftin ar putea
   * cere livrare gratuita declarand o valoare umflata.
   */
  assert.match(
    sursa(), /subtotal: valoareMarfii,/,
    "regulile de transport nu mai primesc suma PLAFONATA: livrarea gratuita s-ar putea umfla",
  );
});
