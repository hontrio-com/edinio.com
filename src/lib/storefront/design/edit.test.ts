import test from "node:test";
import assert from "node:assert/strict";
import {
  addSection,
  addableKinds,
  duplicateSection,
  moveSection,
  removeSection,
  toggleSection,
  updateSection,
} from "./edit";
import { buildClassicDesign } from "./defaults";
import type { DesignContext } from "./types";

/**
 * Operatiile editorului asupra configuratiei.
 *
 * Sunt functii pure tocmai ca sa poata fi verificate aici, nu prin click-uri:
 * o reordonare gresita sau un singleton duplicat ar rupe pagina unui magazin
 * real, iar comparatia cu productia nu le-ar prinde niciodata (magazinele de
 * azi n-au configuratie salvata).
 */

const ctx: DesignContext = { primaryColor: "#1AB554", pageContent: {}, features: {} };
const design = () => buildClassicDesign(ctx);
const kinds = (d: ReturnType<typeof design>) => d.home.map((s) => s.kind);

test("mutarea unei sectiuni schimba doar ordinea", () => {
  const d = design();
  const inainte = [...kinds(d)];
  const dupa = moveSection(d, 0, 3);
  assert.equal(dupa.home.length, d.home.length);
  assert.deepEqual([...dupa.home].map((s) => s.kind).sort(), [...inainte].sort(), "aceleasi sectiuni");
  assert.equal(dupa.home[3].kind, inainte[0], "prima a ajuns pe pozitia a patra");
  assert.deepEqual(kinds(d), inainte, "originalul ramane neatins");
});

test("indicii in afara listei nu schimba nimic", () => {
  const d = design();
  assert.equal(moveSection(d, 0, 99), d);
  assert.equal(moveSection(d, -1, 2), d);
  assert.equal(moveSection(d, 2, 2), d);
});

test("comutarea vizibilitatii merge si pe partea fixa", () => {
  const d = design();
  const dupa = toggleSection(d, "header");
  assert.equal(dupa.chrome.header.enabled, false);
  assert.equal(d.chrome.header.enabled, true, "originalul ramane neatins");
});

test("sectiunile fara care magazinul n-ar functiona nu pot fi sterse", () => {
  const d = design();
  assert.equal(removeSection(d, "header"), d, "header-ul ramane");
  assert.equal(removeSection(d, "footer"), d, "footerul ramane");
  assert.equal(removeSection(d, "catalog"), d, "catalogul ramane");

  const faraGalerie = removeSection(d, "gallery");
  assert.ok(!faraGalerie.home.some((s) => s.id === "gallery"));
});

test("bara de anunt se sterge din partea fixa, nu din lista", () => {
  const d = design();
  const dupa = removeSection(d, "announcement");
  assert.equal(dupa.chrome.announcement, null);
});

test("doar sectiunile care pot exista de mai multe ori se duplica", () => {
  const d = design();
  assert.equal(duplicateSection(d, "hero"), d, "hero e singleton");

  const dupa = duplicateSection(d, "featured");
  assert.equal(dupa.home.filter((s) => s.kind === "product_row").length, 2);
  const ids = dupa.home.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "copia primeste id nou");
});

test("adaugarea pune sectiunea inaintea catalogului", () => {
  let d = design();
  d = removeSection(d, "reviews");
  const dupa = addSection(d, "reviews");
  const iRecenzii = dupa.home.findIndex((s) => s.kind === "reviews");
  const iCatalog = dupa.home.findIndex((s) => s.kind === "product_grid");
  assert.ok(iRecenzii >= 0 && iRecenzii < iCatalog, "intra deasupra catalogului");
});

test("un singleton deja prezent nu se adauga a doua oara", () => {
  const d = design();
  assert.equal(addSection(d, "hero"), d);
  assert.ok(!addableKinds(d).includes("hero"));
});

test("randurile de produse raman mereu adaugabile", () => {
  const d = design();
  assert.ok(addableKinds(d).includes("product_row"));
  const dupa = addSection(d, "product_row");
  assert.equal(dupa.home.filter((s) => s.kind === "product_row").length, 2);
});

test("schimbarea variantei nu atinge restul sectiunii", () => {
  const d = design();
  const dupa = updateSection(d, "hero", { variant: "overlay" });
  const hero = dupa.home.find((s) => s.id === "hero");
  assert.equal(hero?.variant, "overlay");
  assert.equal(hero?.enabled, d.home.find((s) => s.id === "hero")?.enabled);
});

test("o sectiune inexistenta lasa designul neschimbat", () => {
  const d = design();
  assert.equal(updateSection(d, "nu-exista", { enabled: false }), d);
  assert.equal(removeSection(d, "nu-exista"), d);
  assert.equal(duplicateSection(d, "nu-exista"), d);
});
