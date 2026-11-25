import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { SIGLE_MICI, siglaMica } from "./sigle";

test("o sigla cu varianta mica isi ia varianta mica, celelalte raman pe fisierul lor", () => {
  assert.equal(siglaMica("/integrations/cargus.svg"), "/integrations/mici/cargus.webp");
  assert.equal(siglaMica("/integrations/sameday.webp"), "/integrations/mici/sameday.webp");
  /* Fara rand in lista: fisierul ei, neschimbat. */
  assert.equal(siglaMica("/integrations/dpd.svg"), "/integrations/dpd.svg");
  assert.equal(siglaMica("/integrations/fan-courier.svg"), "/integrations/fan-courier.svg");
});

test("ce nu e o cale din `public/integrations/` trece neatins", () => {
  for (const cale of ["", "cargus.svg", "/integrations/mici/cargus.webp", "https://exemplu.ro/integrations/cargus.svg", "/integrations/cargus"]) {
    assert.equal(siglaMica(cale), cale, cale);
  }
});

test("⚠ fiecare nume din lista are fisierul lui pe disc", () => {
  /*
   * Un nume trecut in lista fara fisier ar da o sigla RUPTA pe butonul de AWB sau de factura, la
   * toate magazinele care au curierul acela: `siglaMica` intoarce calea fara sa intrebe discul.
   */
  for (const nume of SIGLE_MICI) {
    const fisier = path.join(process.cwd(), "public", "integrations", "mici", `${nume}.webp`);
    assert.ok(existsSync(fisier), `lipseste public/integrations/mici/${nume}.webp`);
  }
});
