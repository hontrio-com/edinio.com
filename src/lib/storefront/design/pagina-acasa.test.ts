import test from "node:test";
import assert from "node:assert/strict";
import { buildClassicDesign } from "./defaults";
import { aplicaPaginaAcasa, sectiuniDinBlocuri } from "./pagina-acasa";
import { shopOnPage, sectiuniAcasa } from "./commerce";
import { citestePaginaAcasa } from "@/lib/pages/pagina-acasa";
import type { Block } from "@/lib/pages/blocks.types";

const ID = "8f2c1a4e-1111-4222-8333-944455556666";
const pc = {
  show_featured_section: true,
  product_sections: [{ id: "rand-noi", title: "Noutati", mode: "category", category: "Inele" }],
};
const design = buildClassicDesign({ primaryColor: "#07c527", pageContent: pc, features: {} });

const text = (id: string): Block => ({ id, type: "text", html: "<p>x</p>" });

test("blocurile obisnuite de la rand devin o singura sectiune, intre sectiunile magazinului", () => {
  const blocks: Block[] = [
    { id: "h", type: "hero", title: "Bijuterii" },
    text("t1"),
    { id: "a1", type: "acasa", sectiune: "category_nav" },
    text("t2"),
    { id: "a2", type: "acasa", sectiune: "catalog" },
  ];
  const r = sectiuniDinBlocuri(blocks, design);
  assert.deepEqual(r.home.map((s) => s.kind), ["rich_blocks", "category_nav", "rich_blocks", "catalog_toolbar", "product_grid"]);
  assert.deepEqual(Object.values(r.grupuri).map((g) => g.map((b) => b.id)), [["h", "t1"], ["t2"]]);
  assert.equal(r.areCatalog, true);
  assert.ok(r.home.every((s) => s.enabled));
});

test("randul de produse pastreaza id-ul randului (dupa el se cer produsele); acelasi rand nu apare de doua ori", () => {
  const r = sectiuniDinBlocuri([
    { id: "a", type: "acasa", sectiune: "product_row", rand: "rand-noi" },
    { id: "b", type: "acasa", sectiune: "product_row", rand: "featured" },
    { id: "c", type: "acasa", sectiune: "product_row", rand: "rand-noi" },
  ], design);
  assert.deepEqual(r.home.map((s) => s.id), ["rand-noi", "featured"]);
  assert.equal(r.areCatalog, false);
});

test("bannerele iau designul ales in bloc; catalogul fara bara are doar grila", () => {
  const r = sectiuniDinBlocuri([
    { id: "a", type: "acasa", sectiune: "hero", varianta: "overlay" },
    { id: "b", type: "acasa", sectiune: "catalog", cuBara: false },
  ], design);
  assert.equal(r.home[0].kind, "hero");
  assert.equal(r.home[0].variant, "overlay");
  assert.deepEqual(r.home.slice(1).map((s) => s.kind), ["product_grid"]);
});

test("fara pagina aleasa designul ramane neatins; cu ea, catalogul are pagina lui", () => {
  assert.equal(aplicaPaginaAcasa(design, pc), design);
  assert.equal(shopOnPage(design), false);
  const cu = aplicaPaginaAcasa(design, { ...pc, pagina_acasa: ID });
  assert.equal(shopOnPage(cu), true);
  // Setarile implicite ale paginii de catalog, nu un obiect gol.
  assert.equal(cu.shop.page.settings.titlu, "Toate produsele");
});

test("pagina principala fara bloc de catalog nu tine grila acasa", () => {
  const cu = aplicaPaginaAcasa(design, { pagina_acasa: ID });
  const { home } = sectiuniDinBlocuri([text("t")], cu);
  const fara = { ...cu, home, shop: { ...cu.shop, page: { ...cu.shop.page, settings: { ...cu.shop.page.settings, pastreazaGrilaAcasa: false } } } };
  assert.deepEqual(sectiuniAcasa(fara).map((s) => s.kind), ["rich_blocks"]);
});

test("cheia se citeste doar ca id de pagina", () => {
  assert.equal(citestePaginaAcasa({ pagina_acasa: ID }), ID);
  assert.equal(citestePaginaAcasa({ pagina_acasa: "despre-noi" }), null);
  assert.equal(citestePaginaAcasa({}), null);
  assert.equal(citestePaginaAcasa(null), null);
});
