import test from "node:test";
import assert from "node:assert/strict";
import { ciornaAFostSchimbata } from "./draft-guard";
import { parseStoreDesign } from "./parse";
import { buildClassicDesign } from "./defaults";
import { updateSection } from "./edit";
import type { DesignContext } from "./types";

/**
 * Garda de concurenta a cioarnei de design.
 *
 * Rulare: `npm test`.
 */

const ctx: DesignContext = { primaryColor: "#1AB554", pageContent: {}, features: {} };

const publicat = buildClassicDesign(ctx);
/** O ciorna reala: acelasi design, cu un header schimbat. */
const ciorna = updateSection(publicat, publicat.chrome.header.id, { variant: "centered" });

test("⚠⚠ coloana goala + client care stie ca e goala = prima salvare TRECE", () => {
  // Regresia care bloca editorul de design: coloana e `NULL` dupa fiecare
  // Publica si dupa fiecare Renunta, deci asta e drumul obisnuit, nu unul rar.
  // Cat timp a picat, ciorna nu se scria niciodata si tot ce facea comerciantul
  // se pierdea la reincarcare.
  assert.equal(ciornaAFostSchimbata(null, null, ctx), false);
});

test("⚠ coloana goala + client care trimite designul de pe ecran = conflict", () => {
  // Exact bug-ul: editorul trimitea ce vedea (designul PUBLICAT), nu ce scrie in
  // coloana. Garda are dreptate sa refuze — clientul minte despre punctul de
  // pornire — deci reparatia sta in ce trimite clientul, nu in a slabi garda.
  assert.equal(ciornaAFostSchimbata(null, publicat, ctx), true);
});

test("coloana golita de alta fila (Publica / Renunta) opreste autosalvarea veche", () => {
  // Fila A a publicat, deci coloana e `NULL`. Fila B inca tine minte ciorna
  // dinainte; lasata sa scrie, ar reinvia ciorna publicata deja.
  assert.equal(ciornaAFostSchimbata(null, ciorna, ctx), true);
});

test("aceeasi ciorna de ambele parti = fara conflict", () => {
  assert.equal(ciornaAFostSchimbata(ciorna, ciorna, ctx), false);
});

test("alta ciorna in baza = conflict", () => {
  const alta = updateSection(publicat, publicat.chrome.header.id, { variant: "minimal" });
  assert.equal(ciornaAFostSchimbata(alta, ciorna, ctx), true);
});

test("⚠ parserul e idempotent: in baza sta `parse(x)`, clientul trimite `x`", () => {
  // Proprietatea pe care se sprijina toata garda. `saveDesignDraft` scrie in
  // coloana forma PARSATA, iar clientul tine minte obiectul lui neparsat; daca
  // parsarea nu ar fi stabila, a doua salvare din aceeasi sesiune ar raporta un
  // conflict inventat, si editorul s-ar bloca dupa exact o modificare.
  const oData = parseStoreDesign(ciorna, ctx);
  const deDouaOri = parseStoreDesign(oData, ctx);
  assert.deepEqual(deDouaOri, oData);
  assert.equal(ciornaAFostSchimbata(oData, ciorna, ctx), false);
});

test("o coloana goala altfel decat `null` conteaza tot ca lipsa de ciorna", () => {
  // `{}` parsat da designul classic, care nu e o ciorna. Fara tratamentul asta,
  // un rand scris de o migratie ar reinvia blocajul.
  for (const gol of [{}, [], "", 0]) {
    assert.equal(ciornaAFostSchimbata(gol, null, ctx), false, `pentru ${JSON.stringify(gol)}`);
  }
});
