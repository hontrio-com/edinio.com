import test from "node:test";
import assert from "node:assert/strict";
import { EDITOR_PARAM, EDITOR_VALUE, PREVIEW_QUERY, esteEditorDeDesign } from "./preview-protocol";

/**
 * Separarea dintre „previzualizare" si „editorul de design".
 *
 * Rulare: `npm test`.
 */

test("⚠⚠ `preview=1` singur NU inseamna editorul de design", () => {
  // Regresia care a omorat previzualizarea din „Editeaza magazinul": editorul
  // vechi pune si el `preview=1`, iar cand marcarea sectiunilor si blocarea
  // clicurilor atarnau de steagul asta, iframe-ul lui devenea o poza pe care nu
  // se putea da click nicaieri.
  assert.equal(esteEditorDeDesign({ preview: "1" }, true), false);
});

test("semnul editorului cere si `preview=1`", () => {
  // Fara el, proxy-ul redirecteaza catre domeniul propriu si iframe-ul e blocat
  // de X-Frame-Options — deci semnul singur n-are ce previzualiza.
  assert.equal(esteEditorDeDesign({ [EDITOR_PARAM]: EDITOR_VALUE }, true), false);
});

test("⚠ un vizitator strain cu adresa copiata nu intra in modul editor", () => {
  // Altfel ar primi magazinul frumos si complet neclicabil, fara niciun mesaj.
  // Semnul se si lipeste de sesiune: rescrierea adresei la filtrare pastreaza
  // parametrii straini, deci ar ramane blocat cat tine navigarea.
  assert.equal(esteEditorDeDesign({ preview: "1", [EDITOR_PARAM]: EDITOR_VALUE }, false), false);
});

test("proprietarul cu ambele semne intra in modul editor", () => {
  assert.equal(esteEditorDeDesign({ preview: "1", [EDITOR_PARAM]: EDITOR_VALUE }, true), true);
});

test("o valoare straina pe parametrul editorului nu deschide modul", () => {
  for (const v of ["1", "true", "", "Design", "sectiuni"]) {
    assert.equal(esteEditorDeDesign({ preview: "1", [EDITOR_PARAM]: v }, true), false, `pentru "${v}"`);
  }
});

test("sirul folosit de iframe chiar trece propria verificare", () => {
  // Sirul si cititorul stau in acelasi fisier tocmai ca sa nu poata diverge;
  // testul inchide cercul, citind sirul ca pe o adresa reala.
  const sp = Object.fromEntries(new URLSearchParams(PREVIEW_QUERY));
  assert.equal(esteEditorDeDesign(sp, true), true);
});
