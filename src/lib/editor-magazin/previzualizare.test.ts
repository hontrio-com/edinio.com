import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LATIMI_DISPOZITIV, latimeaRandarii } from "./previzualizare";

/*
 * Previzualizarea din editor (lista lui, 27.10.2026, punctul 3): „Calculator” pe tot chenarul, fara
 * benzile goale din stanga si din dreapta; sub 1280 px, tot pragurile de calculator, micsorate.
 */

test("⚠ „Calculator” ia tot chenarul cand e mai lat de 1280 px", () => {
  assert.equal(latimeaRandarii("desktop", 1520), 1520);
  assert.equal(latimeaRandarii("desktop", 1919.6), 1919, "fara jumatati de pixel: altfel apare o bara de derulare");
});

test("sub 1280 px „Calculator” ramane 1280 (pragurile de calculator), iar chenarul il micsoreaza", () => {
  assert.equal(latimeaRandarii("desktop", 900), LATIMI_DISPOZITIV.desktop);
  assert.equal(latimeaRandarii("desktop", 1280.4), LATIMI_DISPOZITIV.desktop);
  // Inainte de prima masuratoare chenarul are 0: randarea porneste tot de la 1280.
  assert.equal(latimeaRandarii("desktop", 0), LATIMI_DISPOZITIV.desktop);
});

test("telefonul si tableta raman la latimea lor, oricat de lat e chenarul", () => {
  assert.equal(latimeaRandarii("mobil", 1520), 390);
  assert.equal(latimeaRandarii("tableta", 1520), 768);
  assert.equal(latimeaRandarii("mobil", 300), 390);
});

test("⚠ arborele editorului e fara iconite (lista lui, punctul 4: „fa ceva mai Clean”)", () => {
  // Sectiunile cadeau toate pe scut: iconitele lor nu erau in setul paginilor proprii (`PAGE_ICONS`).
  for (const f of [
    "src/components/store-editor/SectionList.tsx",
    "src/components/editor-magazin/ArboreSectiuni.tsx",
    "src/components/editor-magazin/ArborePagina.tsx",
  ]) {
    const s = readFileSync(path.join(process.cwd(), f), "utf8");
    assert.doesNotMatch(s, /<PageIcon|<IconitaBloc/, f);
  }
});

test("rama foloseste regula, nu latimea fixa a dispozitivului", () => {
  const s = readFileSync(path.join(process.cwd(), "src/components/store-editor/RamaPreview.tsx"), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const latime = latimeaRandarii\(dispozitiv, masura\.latime\);/);
  assert.doesNotMatch(s, /const latime = LATIMI_DISPOZITIV\[dispozitiv\];/);
});
