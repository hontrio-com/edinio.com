import test from "node:test";
import assert from "node:assert/strict";
import { groupSections } from "./group-sections";
import { buildClassicDesign, section } from "./defaults";
import type { DesignContext, SectionInstance } from "./types";

/**
 * Gruparea sectiunilor in containere.
 *
 * E singura bucata de logica noua din randare pe care comparatia cu productia nu
 * o poate acoperi: toate magazinele reale au aceeasi ordine, deci ordinile pe
 * care le poate produce editorul raman netestate acolo.
 */

const ctx: DesignContext = { primaryColor: "#1AB554", pageContent: {}, features: {} };

const forma = (sections: SectionInstance[]) =>
  groupSections(sections).map((b) =>
    b.tip === "full" ? `full:${b.section.kind}` : `${b.esteMain ? "main" : "div"}:${b.sections.map((s) => s.kind).join(",")}`,
  );

test("layout-ul classic da un singur main, dupa sectiunile pe latime completa", () => {
  // Toate sectiunile pornite: cele oprite sunt filtrate, deci un magazin
  // implicit ar da un main mai scurt.
  const d = buildClassicDesign({
    ...ctx,
    tagline: "Ceva",
    pageContent: {
      show_trust_strip_on_store: true,
      show_shipping_progress: true,
      show_featured_section: true,
      store_benefits_section: { enabled: true },
      reviews_section: { enabled: true },
    },
  });
  assert.deepEqual(forma(d.home), [
    "full:hero",
    "full:usp_strip",
    "main:catalog_toolbar,category_nav,shipping_progress,product_row,product_grid,benefits,reviews,gallery,about,contact",
  ]);
});

test("o sectiune pe latime completa mutata la mijloc taie containerul in doua", () => {
  const forma1 = forma([
    section("a", "catalog_toolbar", "classic"),
    section("b", "hero", "banners"),
    section("c", "product_grid", "classic"),
  ]);
  assert.deepEqual(forma1, ["main:catalog_toolbar", "full:hero", "div:product_grid"]);
});

test("main-ul e mereu primul container, chiar daca pagina incepe cu hero", () => {
  const blocuri = groupSections([
    section("h", "hero", "banners"),
    section("g", "product_grid", "classic"),
    section("u", "usp_strip", "icons"),
    section("r", "reviews", "grid"),
  ]);
  const grupuri = blocuri.filter((b) => b.tip === "grup");
  assert.equal(grupuri.length, 2);
  assert.equal(grupuri.filter((g) => g.tip === "grup" && g.esteMain).length, 1, "un singur <main> pe pagina");
  assert.equal(grupuri[0].tip === "grup" && grupuri[0].esteMain, true, "primul container e main-ul");
});

test("sectiunile dezactivate nu deschid containere goale", () => {
  const forma1 = forma([
    section("h", "hero", "banners"),
    section("t", "catalog_toolbar", "classic", false),
    section("u", "usp_strip", "icons"),
    section("g", "product_grid", "classic"),
  ]);
  assert.deepEqual(forma1, ["full:hero", "full:usp_strip", "main:product_grid"]);
});

test("o pagina numai din sectiuni pe latime completa nu produce niciun container", () => {
  assert.deepEqual(forma([section("h", "hero", "banners"), section("u", "usp_strip", "icons")]), [
    "full:hero",
    "full:usp_strip",
  ]);
});

test("o sectiune scoasa din catalog e tratata ca avand container", () => {
  // Variantele necunoscute nu ajung aici (parserul le curata), dar daca ar
  // ajunge, implicitul sigur e containerul: o sectiune pe toata latimea pusa
  // gresit ar sparge layout-ul, una in container doar ar arata ingust.
  assert.deepEqual(forma([section("x", "hero", "varianta-inexistenta")]), ["main:hero"]);
});
