import test from "node:test";
import assert from "node:assert/strict";
import { cuSemnePastrate } from "./preview-sticky";

/**
 * Semnele de previzualizare care trebuie sa supravietuiasca navigarii.
 *
 * Rulare: `npm test`.
 */

const IN_EDITOR = "?preview=1&editor=design";
const IN_EDITORUL_VECHI = "?preview=1";

test("⚠⚠ o adresa curata primeste semnele, altfel primul click face iframe-ul alb", () => {
  // Fara `preview=1`, `proxy.ts` redirecteaza catre `www` sau catre domeniul
  // propriu — amandoua cross-origin — si X-Frame-Options refuza incadrarea.
  assert.equal(cuSemnePastrate("/magazinul-meu", IN_EDITORUL_VECHI), "/magazinul-meu?preview=1");
});

test("ambele semne se pastreaza in editorul de design", () => {
  assert.equal(cuSemnePastrate("/m", IN_EDITOR), "/m?preview=1&editor=design");
});

test("o adresa care are deja filtre isi pastreaza codificarea", () => {
  // ⚠ Adresele catalogului codifica spatiile cu %20 peste tot. O plimbare prin
  // `URLSearchParams` le-ar rescrie cu `+` si ar produce o a doua adresa pentru
  // exact acelasi continut — chiar lucrul pe care canonicalele il evita.
  assert.equal(
    cuSemnePastrate("/m?cat=Geci%20si%20jachete&page=3", IN_EDITORUL_VECHI),
    "/m?cat=Geci%20si%20jachete&page=3&preview=1",
  );
});

test("un semn deja prezent nu se dubleaza", () => {
  assert.equal(cuSemnePastrate("/m?preview=1", IN_EDITOR), "/m?preview=1&editor=design");
  assert.equal(cuSemnePastrate("/m?preview=1&editor=design", IN_EDITOR), "/m?preview=1&editor=design");
});

test("ancora ramane la coada, dupa interogare", () => {
  assert.equal(cuSemnePastrate("/m#produse", IN_EDITORUL_VECHI), "/m?preview=1#produse");
  assert.equal(cuSemnePastrate("/m?cat=x#produse", IN_EDITORUL_VECHI), "/m?cat=x&preview=1#produse");
});

test("in afara previzualizarii adresa se intoarce neatinsa", () => {
  assert.equal(cuSemnePastrate("/m?cat=x", ""), "/m?cat=x");
  assert.equal(cuSemnePastrate("/m", "?utm_source=fb"), "/m");
});

test("⚠ adresele care nu sunt cai interne nu primesc nimic", () => {
  // Pe `//alt-domeniu` lipirea semnelor ar trimite starea editorului in alta
  // parte; pe `tel:`/`mailto:` n-ar insemna nimic.
  for (const href of ["https://exemplu.ro/x", "//exemplu.ro/x", "tel:+40700000000", "mailto:a@b.ro", "#sus"]) {
    assert.equal(cuSemnePastrate(href, IN_EDITOR), href, `pentru ${href}`);
  }
});

test("o valoare straina pe `preview` se pastreaza asa cum e, nu se normalizeaza", () => {
  // Cititorii decid ce inseamna; ajutorul asta doar carA valoarea mai departe.
  assert.equal(cuSemnePastrate("/m", "?preview=0"), "/m?preview=0");
});
